"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Phone, PhoneOff, Delete, Mic, MicOff, Volume2, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function Dialer() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isInCall, setIsInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const handleNumberClick = (num: string) => {
    if (phoneNumber.length < 15) setPhoneNumber((prev) => prev + num);
  };

  const handleDelete = () => setPhoneNumber((prev) => prev.slice(0, -1));

  const toggleCall = () => {
    if (!phoneNumber) { toast.error("Please enter a phone number"); return; }
    if (isInCall) { setIsInCall(false); toast.info("Call ended"); }
    else { setIsInCall(true); toast.success(`Calling ${phoneNumber}...`); }
  };

  const keypad = ["1","2","3","4","5","6","7","8","9","*","0","#"];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <Card className="lg:col-span-1 border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <Phone size={20} className="text-primary" />
            Dialer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="relative">
            <Input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="text-2xl h-14 text-center font-bold tracking-widest"
              placeholder="000-000-0000"
            />
            {phoneNumber && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={handleDelete}
              >
                <Delete size={20} className="text-muted-foreground" />
              </Button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            {keypad.map((key) => (
              <Button
                key={key}
                variant="outline"
                className="h-16 text-xl font-semibold hover:bg-primary hover:text-primary-foreground transition-all"
                onClick={() => handleNumberClick(key)}
              >
                {key}
              </Button>
            ))}
          </div>

          <div className="flex justify-center gap-4">
            {isInCall && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  className={cn("h-14 w-14 rounded-full", isMuted && "bg-destructive/10 text-destructive border-destructive/20")}
                  onClick={() => setIsMuted(!isMuted)}
                >
                  {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                </Button>
                <Button variant="outline" size="icon" className="h-14 w-14 rounded-full">
                  <Volume2 size={24} />
                </Button>
              </>
            )}
            <Button
              className={cn(
                "h-14 w-14 rounded-full shadow-lg transition-all",
                isInCall ? "bg-destructive hover:bg-destructive/90" : "bg-green-500 hover:bg-green-600"
              )}
              onClick={toggleCall}
            >
              {isInCall ? <PhoneOff size={24} /> : <Phone size={24} />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2 border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <History size={20} className="text-primary" />
            Call History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Phone size={36} className="text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No calls yet.</p>
            <p className="text-xs text-muted-foreground">Calls you make will appear here.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
