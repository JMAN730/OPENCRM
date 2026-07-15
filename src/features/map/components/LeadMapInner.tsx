"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Rectangle,
  TileLayer,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "sonner";
import { trpc } from "@/app/_trpc/client";
import type { MapBounds } from "@/features/map/shared/coords";
import { SelectionPanel } from "./SelectionPanel";
import { leadDisplayName } from "@/lib/leadName";

export type MapLead = {
  id: string;
  company: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type DiscoveredBusiness = {
  osmType: string;
  osmId: number;
  name: string;
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
  existingLeadId?: string;
};

export type SelectedItem =
  | { key: string; kind: "lead"; lead: MapLead }
  | { key: string; kind: "osm"; osm: DiscoveredBusiness };

const US_CENTER: [number, number] = [39.5, -98.35];

function leadKey(id: string): string {
  return `lead:${id}`;
}
function osmKey(b: DiscoveredBusiness): string {
  return `osm:${b.osmType}:${b.osmId}`;
}

function leadLabel(lead: MapLead): string {
  return leadDisplayName(lead, "Unnamed lead");
}

function pinIcon(kind: "lead" | "osm", selected: boolean): L.DivIcon {
  const color = kind === "lead" ? "bg-blue-600" : "bg-amber-500";
  const ring = selected ? "ring-4 ring-emerald-400/80 scale-125" : "";
  return L.divIcon({
    className: "",
    html: `<div class="h-4 w-4 rounded-full border-2 border-white shadow-md transition-transform ${color} ${ring}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

/**
 * Converts leaflet bounds to the API shape. Panning across the antimeridian
 * gives wrapped longitudes the API rejects; clamp, and fall back to the whole
 * longitude range when the clamp inverts the box.
 */
function toApiBounds(bounds: L.LatLngBounds): MapBounds {
  const south = Math.max(-90, bounds.getSouth());
  const north = Math.min(90, bounds.getNorth());
  let west = Math.max(-180, bounds.getWest());
  let east = Math.min(180, bounds.getEast());
  if (west >= east) {
    west = -180;
    east = 180;
  }
  return { south, west, north, east };
}

/**
 * Leads geocoded to the same city centroid stack exactly; spread them on a
 * small deterministic ring so each pin stays clickable.
 */
function jitterStackedPins(leads: MapLead[]): Array<MapLead & { lat: number; lng: number }> {
  const seen = new Map<string, number>();
  const out: Array<MapLead & { lat: number; lng: number }> = [];
  for (const lead of leads) {
    if (lead.latitude == null || lead.longitude == null) continue;
    const key = `${lead.latitude},${lead.longitude}`;
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    if (index === 0) {
      out.push({ ...lead, lat: lead.latitude, lng: lead.longitude });
    } else {
      const angle = (index * 137.5 * Math.PI) / 180; // golden-angle spiral
      const radius = 0.0006 * Math.sqrt(index);
      out.push({
        ...lead,
        lat: lead.latitude + radius * Math.sin(angle),
        lng: lead.longitude + radius * Math.cos(angle),
      });
    }
  }
  return out;
}

/** Publishes debounced viewport bounds and supports rectangle selection. */
function MapEventBridge({
  onBoundsChange,
  selecting,
  onSelectRect,
}: {
  onBoundsChange: (bounds: L.LatLngBounds) => void;
  selecting: boolean;
  onSelectRect: (bounds: L.LatLngBounds) => void;
}) {
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragStart, setDragStart] = useState<L.LatLng | null>(null);
  const [dragCurrent, setDragCurrent] = useState<L.LatLng | null>(null);

  const map = useMapEvents({
    moveend() {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => onBoundsChange(map.getBounds()), 300);
    },
    mousedown(e) {
      if (!selecting) return;
      setDragStart(e.latlng);
      setDragCurrent(e.latlng);
    },
    mousemove(e) {
      if (!selecting || !dragStart) return;
      setDragCurrent(e.latlng);
    },
    mouseup(e) {
      if (!selecting || !dragStart) return;
      const rect = L.latLngBounds(dragStart, e.latlng);
      setDragStart(null);
      setDragCurrent(null);
      onSelectRect(rect);
    },
  });

  useEffect(() => {
    // Report the initial viewport once the map is ready.
    onBoundsChange(map.getBounds());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const container = map.getContainer();
    if (selecting) {
      map.dragging.disable();
      container.style.cursor = "crosshair";
    } else {
      map.dragging.enable();
      container.style.cursor = "";
    }
    return () => {
      map.dragging.enable();
      container.style.cursor = "";
    };
  }, [selecting, map]);

  if (!dragStart || !dragCurrent) return null;
  return (
    <Rectangle
      bounds={L.latLngBounds(dragStart, dragCurrent)}
      pathOptions={{ color: "#10b981", weight: 1.5, fillOpacity: 0.08 }}
    />
  );
}

type JobProgress = {
  status: string;
  totalQueries: number;
  completedQueries: number;
  failedQueries: number;
  error: string | null;
};

const JOB_POLL_INTERVAL_MS = 2000;
const JOB_POLL_MAX_TICKS = 300; // ~10 minutes

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function LeadMapInner() {
  const utils = trpc.useUtils();
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [category, setCategory] = useState<string>("");
  const [discovered, setDiscovered] = useState<DiscoveredBusiness[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Map<string, SelectedItem>>(new Map());
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null);
  const [locating, setLocating] = useState(false);

  const { data: config } = trpc.map.discoveryCategories.useQuery();
  const { data: missing } = trpc.map.missingCoordinatesCount.useQuery();
  const { data: leads } = trpc.map.leadsInBounds.useQuery(
    { bounds: bounds as MapBounds },
    { enabled: bounds !== null, placeholderData: (prev) => prev },
  );

  const geocodeMissing = trpc.map.geocodeMissing.useMutation();
  const enrich = trpc.map.enrich.useMutation();

  const leadPins = useMemo(() => jitterStackedPins(leads ?? []), [leads]);
  const leadIdsOnMap = useMemo(() => new Set((leads ?? []).map((l) => l.id)), [leads]);
  const discoveredPins = useMemo(
    () =>
      discovered.filter(
        (b) => !(b.existingLeadId && leadIdsOnMap.has(b.existingLeadId)),
      ),
    [discovered, leadIdsOnMap],
  );

  const toggleItem = useCallback((item: SelectedItem) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.key)) next.delete(item.key);
      else next.set(item.key, item);
      return next;
    });
  }, []);

  const removeItem = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const handleSelectRect = useCallback(
    (rect: L.LatLngBounds) => {
      setSelected((prev) => {
        const next = new Map(prev);
        for (const lead of leadPins) {
          if (!rect.contains([lead.lat, lead.lng])) continue;
          const key = leadKey(lead.id);
          if (!next.has(key)) next.set(key, { key, kind: "lead", lead });
        }
        for (const biz of discoveredPins) {
          if (!rect.contains([biz.lat, biz.lng])) continue;
          const key = osmKey(biz);
          if (!next.has(key)) next.set(key, { key, kind: "osm", osm: biz });
        }
        return next;
      });
      setSelecting(false);
    },
    [leadPins, discoveredPins],
  );

  const handleDiscover = useCallback(async () => {
    if (!bounds) return;
    if (!category) {
      toast.error("Pick a business category first.");
      return;
    }
    setDiscovering(true);
    try {
      const res = await utils.map.discoverBusinesses.fetch({ bounds, category });
      setDiscovered(res.items);
      toast.success(
        res.items.length
          ? `Found ${res.items.length} ${category} business(es) in view.`
          : "No businesses found in this area — try panning or another category.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Discovery failed.");
    } finally {
      setDiscovering(false);
    }
  }, [bounds, category, utils]);

  const handleLocateLeads = useCallback(async () => {
    setLocating(true);
    try {
      // Each call handles a bounded batch; loop until nothing is left or no
      // further progress is possible (leads with no city/state to geocode).
      for (let i = 0; i < 20; i++) {
        const res = await geocodeMissing.mutateAsync();
        await Promise.all([
          utils.map.leadsInBounds.invalidate(),
          utils.map.missingCoordinatesCount.invalidate(),
        ]);
        if (res.remaining === 0) {
          toast.success("All leads located.");
          return;
        }
        if (res.fromMapsUrl === 0 && res.geocoded === 0) {
          toast.info(
            `${res.remaining} lead(s) have no usable location data and could not be placed.`,
          );
          return;
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Locating leads failed.");
    } finally {
      setLocating(false);
    }
  }, [geocodeMissing, utils]);

  const handleEnrich = useCallback(async () => {
    const items = [...selected.values()];
    if (items.length === 0) return;
    const leadIds = items.filter((i) => i.kind === "lead").map((i) => i.lead.id);
    const osmBusinesses = items
      .filter((i) => i.kind === "osm")
      .map(({ osm }) => ({
        osmType: osm.osmType,
        osmId: osm.osmId,
        name: osm.name,
        lat: osm.lat,
        lng: osm.lng,
        phone: osm.phone,
        website: osm.website,
      }));
    let jobId: string;
    try {
      const res = await enrich.mutateAsync({
        leadIds,
        osmBusinesses,
        category: category || undefined,
      });
      jobId = res.jobId;
      if (res.createdLeads > 0) {
        toast.success(`Created ${res.createdLeads} new lead(s) from the map.`);
        void utils.map.leadsInBounds.invalidate();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start enrichment.");
      return;
    }

    // Poll the job to completion. Driving this from the event handler (not an
    // effect) keeps the completion side effects in one obvious place.
    setJobProgress({
      status: "PENDING",
      totalQueries: items.length,
      completedQueries: 0,
      failedQueries: 0,
      error: null,
    });
    try {
      for (let tick = 0; tick < JOB_POLL_MAX_TICKS; tick++) {
        await wait(JOB_POLL_INTERVAL_MS);
        const status = await utils.map.enrichmentStatus.fetch(
          { jobId },
          { staleTime: 0 },
        );
        setJobProgress(status);
        if (status.status === "COMPLETED") {
          toast.success("Enrichment finished — lead contact details updated.");
          setSelected(new Map());
          void utils.map.leadsInBounds.invalidate();
          break;
        }
        if (status.status === "FAILED" || status.status === "STOPPED") {
          toast.error(status.error ?? "Enrichment did not finish.");
          break;
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lost track of the enrichment job.");
    } finally {
      setJobProgress(null);
    }
  }, [selected, category, enrich, utils]);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="crm-card flush isolate z-0 min-h-[70vh] flex-1 overflow-hidden">
        <MapContainer
          center={US_CENTER}
          zoom={5}
          scrollWheelZoom
          className="h-[70vh] min-h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapEventBridge
            onBoundsChange={(b) => setBounds(toApiBounds(b))}
            selecting={selecting}
            onSelectRect={handleSelectRect}
          />
          {leadPins.map((lead) => {
            const key = leadKey(lead.id);
            return (
              <Marker
                key={key}
                position={[lead.lat, lead.lng]}
                icon={pinIcon("lead", selected.has(key))}
                eventHandlers={{
                  click: () => toggleItem({ key, kind: "lead", lead }),
                }}
              >
                <Tooltip>{leadLabel(lead)}</Tooltip>
              </Marker>
            );
          })}
          {discoveredPins.map((biz) => {
            const key = osmKey(biz);
            return (
              <Marker
                key={key}
                position={[biz.lat, biz.lng]}
                icon={pinIcon("osm", selected.has(key))}
                eventHandlers={{
                  click: () => toggleItem({ key, kind: "osm", osm: biz }),
                }}
              >
                <Tooltip>{biz.name}</Tooltip>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      <SelectionPanel
        categories={config?.categories ?? []}
        category={category}
        onCategoryChange={setCategory}
        onDiscover={handleDiscover}
        discovering={discovering}
        discoveredCount={discoveredPins.length}
        selecting={selecting}
        onToggleSelecting={() => setSelecting((s) => !s)}
        selected={[...selected.values()]}
        onRemove={removeItem}
        onClear={() => setSelected(new Map())}
        onEnrich={handleEnrich}
        enrichEnabled={config?.enrichEnabled ?? false}
        enrichStarting={enrich.isPending}
        jobStatus={jobProgress}
        missingCount={missing?.count ?? 0}
        onLocateLeads={handleLocateLeads}
        locating={locating}
      />
    </div>
  );
}
