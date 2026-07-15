"use client";

import { useState } from "react";
import { MessageSquareText, Send } from "lucide-react";
import { toast } from "sonner";
import { SmsDraftStatus } from "@prisma/client";
import { trpc } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SmsStatusBadge } from "./SmsStatusBadge";

export function SmsDraftPanel({ leadId }: { leadId: string }) {
  const [body, setBody] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const configuration = trpc.sms.configuration.useQuery();
  const draft = trpc.sms.getForLead.useQuery({ leadId });

  const refresh = () => {
    setBody(null);
    void utils.sms.getForLead.invalidate({ leadId });
  };
  const generate = trpc.sms.generate.useMutation({
    onSuccess: () => {
      toast.success("SMS draft generated.");
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const update = trpc.sms.updateBody.useMutation({
    onSuccess: () => {
      toast.success("SMS draft updated.");
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const send = trpc.sms.send.useMutation({
    onSuccess: () => {
      toast.success("SMS sent.");
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const data = draft.data;
  const currentBody = body ?? data?.body ?? "";
  const editable = data?.status === SmsDraftStatus.DRAFT;
  const dirty = Boolean(data && currentBody !== data.body);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareText size={17} /> SMS outreach
            </CardTitle>
            <CardDescription>Review every text before explicitly sending it.</CardDescription>
          </div>
          {data ? <SmsStatusBadge status={data.status} /> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {configuration.data && !configuration.data.configured ? (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            Twilio SMS is not configured. Add the account, auth token, and Messaging Service SID
            to enable texting; email outreach continues to work normally.
          </p>
        ) : draft.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-8 w-28" />
          </div>
        ) : !data ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Generate a static, compliant text using this lead&apos;s latest demo website.
            </p>
            <Button
              size="sm"
              disabled={generate.isPending}
              onClick={() => generate.mutate({ leadId })}
            >
              {generate.isPending ? "Generating…" : "Generate SMS"}
            </Button>
          </div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">To {data.toPhone}</div>
            <div className="space-y-1">
              <Label htmlFor={`sms-message-${leadId}`}>SMS message</Label>
              <textarea
                id={`sms-message-${leadId}`}
                value={currentBody}
                disabled={!editable}
                rows={6}
                maxLength={1600}
                onChange={(event) => setBody(event.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <div className="text-right text-xs text-muted-foreground">
                {currentBody.length}/1600
              </div>
            </div>
            {data.status === SmsDraftStatus.FAILED ? (
              <p className="text-sm text-destructive">
                This number was undeliverable. Call this lead instead.
              </p>
            ) : null}
            {editable ? (
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!dirty || update.isPending}
                  onClick={() => update.mutate({ id: data.id, body: currentBody })}
                >
                  {update.isPending ? "Saving…" : "Save changes"}
                </Button>
                <Button
                  size="sm"
                  className="gap-1"
                  disabled={dirty || send.isPending}
                  onClick={() => send.mutate({ id: data.id })}
                >
                  <Send size={13} /> {send.isPending ? "Sending…" : "Send SMS"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
