import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { BizLayout } from "@/components/biz-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, Check, Clock3, MapPin, Plus, Trash2, X } from "lucide-react";
import { isStoreBuild } from "@/lib/platform";

type Service = {
  id: number;
  name: string;
  description: string | null;
  confirmation_mode: "instant" | "approval" | "quote";
  pricing_mode: "fixed" | "starting_at" | "quote";
  price_cents: number | null;
  duration_minutes: number | null;
  fulfillment_mode: string;
  location_text: string | null;
  service_area: string | null;
  availability_mode: "appointment" | "window";
  availability_json: Array<{ day: string; start: string; end: string; location?: string }>;
  booking_window_days: number;
  lead_time_hours: number;
  active: boolean;
};

type Booking = {
  id: number;
  service_name: string;
  customer_guber_id: string | null;
  requested_start_at: string | null;
  requested_end_at: string | null;
  status: string;
  customer_note: string | null;
  customer_location: string | null;
  quoted_price_cents: number | null;
  proposed_start_at: string | null;
  business_note: string | null;
  proposal_history: Array<{
    startAt: string;
    endAt: string;
    status: string;
    createdAt: string;
  }>;
};

const EMPTY_FORM = {
  name: "",
  description: "",
  confirmationMode: "approval",
  pricingMode: "quote",
  priceCents: "",
  durationMinutes: "60",
  fulfillmentMode: "in_person",
  locationText: "",
  serviceArea: "",
  availabilityMode: "appointment",
  bookingWindowDays: "30",
  leadTimeHours: "24",
  availability: [] as Array<{ day: string; start: string; end: string; location?: string }>,
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function money(cents: number | null) {
  return cents == null ? "Quote" : `$${(cents / 100).toFixed(2)}`;
}

function modeLabel(mode: string) {
  return mode === "instant" ? "Instant booking" : mode === "approval" ? "Business approval" : "Quote request";
}

function statusColor(status: string) {
  if (status === "confirmed") return "text-emerald-600 bg-emerald-500/10";
  if (status === "declined" || status === "cancelled") return "text-muted-foreground bg-muted";
  if (status === "completed") return "text-primary bg-primary/10";
  return "text-amber-600 bg-amber-500/10";
}

export default function BusinessBookings() {
  const { toast } = useToast();
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [rescheduling, setRescheduling] = useState<number | null>(null);
  const [rescheduleStart, setRescheduleStart] = useState("");
  const { data: access, isLoading: accessLoading } = useQuery<any>({ queryKey: ["/api/business/bookings/access"], retry: false });
  const { data: services = [], isLoading: servicesLoading } = useQuery<Service[]>({
    queryKey: ["/api/business/bookings/services"],
    enabled: access?.enabled === true,
    retry: false,
  });
  const { data: bookings = [], isLoading: bookingsLoading } = useQuery<Booking[]>({
    queryKey: ["/api/business/bookings"],
    enabled: access?.enabled === true,
    retry: false,
  });

  const saveService = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        priceCents: form.priceCents || null,
        durationMinutes: form.availabilityMode === "window" ? null : form.durationMinutes || null,
        bookingWindowDays: Number(form.bookingWindowDays) || 30,
        leadTimeHours: Number(form.leadTimeHours) || 0,
      };
      const response = editing
        ? await apiRequest("PATCH", `/api/business/bookings/services/${editing}`, payload)
        : await apiRequest("POST", "/api/business/bookings/services", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business/bookings/services"] });
      setForm(EMPTY_FORM);
      setEditing(null);
      toast({ title: editing ? "Service updated" : "Service added", description: "Customers will see it on your verified business presence." });
    },
    onError: (error: Error) => toast({ title: "Unable to save service", description: error.message, variant: "destructive" }),
  });

  const deleteService = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/business/bookings/services/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business/bookings/services"] });
      toast({ title: "Service hidden", description: "Existing bookings are preserved." });
    },
    onError: (error: Error) => toast({ title: "Unable to hide service", description: error.message, variant: "destructive" }),
  });

  const updateBooking = useMutation({
    mutationFn: ({ id, status, proposedStartAt }: { id: number; status: string; proposedStartAt?: string }) =>
      apiRequest("PATCH", `/api/business/bookings/${id}/status`, { status, proposedStartAt: proposedStartAt || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business/bookings"] });
      toast({ title: "Booking updated" });
    },
    onError: (error: Error) => toast({ title: "Unable to update booking", description: error.message, variant: "destructive" }),
  });

  const startEdit = (service: Service) => {
    setEditing(service.id);
    setForm({
      name: service.name,
      description: service.description || "",
      confirmationMode: service.confirmation_mode,
      pricingMode: service.pricing_mode,
      priceCents: service.price_cents == null ? "" : String(service.price_cents),
      durationMinutes: service.duration_minutes == null ? "" : String(service.duration_minutes),
      fulfillmentMode: service.fulfillment_mode,
      locationText: service.location_text || "",
      serviceArea: service.service_area || "",
      availabilityMode: service.availability_mode,
      bookingWindowDays: String(service.booking_window_days || 30),
      leadTimeHours: String(service.lead_time_hours || 0),
      availability: service.availability_json || [],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const addWindow = () => setForm((current) => ({
    ...current,
    availability: [...current.availability, { day: "Mon", start: "09:00", end: "17:00", location: "" }],
  }));

  if (accessLoading) return <BizLayout><div className="mx-auto max-w-5xl text-sm text-muted-foreground">Loading Booking & Appointments…</div></BizLayout>;
  if (!access?.enabled) {
    return (
      <BizLayout>
        <div className="mx-auto max-w-3xl rounded-3xl border bg-card p-8 md:p-12">
          <CalendarClock className="h-10 w-10 text-primary" />
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-primary">Paid business feature</p>
          <h1 className="mt-2 text-3xl font-black">Booking & Appointments</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Offer services, appointment windows, mobile visits, pickup/delivery, event requests, and quote-based work through your verified GUBER presence.
          </p>
          <p className="mt-4 text-sm font-semibold">{access?.reason || "An active paid business subscription is required."}</p>
          {isStoreBuild ? (
            <p className="mt-6 rounded-xl bg-muted p-4 text-xs text-muted-foreground">Your native app can recognize access, but subscriptions and billing are managed on guberapp.com.</p>
          ) : (
            <Link href="/biz/dashboard"><Button className="mt-6">View business plan</Button></Link>
          )}
        </div>
      </BizLayout>
    );
  }

  return (
    <BizLayout>
      <div className="mx-auto max-w-5xl space-y-8 pb-12">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Paid business tools</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Booking & Appointments</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Configure each service independently. Use instant slots for a barbershop, approval for a mobile detailer, or quote requests for catering and events.
          </p>
        </header>

        <section className="rounded-2xl border bg-card p-5 md:p-7">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{editing ? "Edit service" : "Add a service"}</h2>
              <p className="mt-1 text-xs text-muted-foreground">Only relevant service details are used on the customer flow.</p>
            </div>
            {editing && <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setForm(EMPTY_FORM); }}><X className="mr-1 h-4 w-4" /> Cancel</Button>}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2"><Label>Service name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Full mobile detail, catering quote, emergency locksmith" /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What should customers know before requesting this service?" /></div>
            <div className="space-y-1.5"><Label>Customer confirmation</Label><Select value={form.confirmationMode} onValueChange={(value) => setForm({ ...form, confirmationMode: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="instant">Instant Booking</SelectItem><SelectItem value="approval">Business Approval</SelectItem><SelectItem value="quote">Quote Request</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Price display</Label><Select value={form.pricingMode} onValueChange={(value) => setForm({ ...form, pricingMode: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fixed">Fixed price</SelectItem><SelectItem value="starting_at">Starting price</SelectItem><SelectItem value="quote">Quote after details</SelectItem></SelectContent></Select></div>
            {(form.pricingMode === "fixed" || form.pricingMode === "starting_at") && <div className="space-y-1.5"><Label>{form.pricingMode === "fixed" ? "Price" : "Starting price"} (cents)</Label><Input type="number" min="0" value={form.priceCents} onChange={(e) => setForm({ ...form, priceCents: e.target.value })} placeholder="7500 = $75.00" /></div>}
            {form.availabilityMode === "appointment" && <div className="space-y-1.5"><Label>Duration (minutes)</Label><Input type="number" min="5" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} /></div>}
            <div className="space-y-1.5"><Label>Service format</Label><Select value={form.fulfillmentMode} onValueChange={(value) => setForm({ ...form, fulfillmentMode: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="in_person">In-person</SelectItem><SelectItem value="mobile">Mobile / at customer location</SelectItem><SelectItem value="pickup_delivery">Pickup / delivery</SelectItem><SelectItem value="event">Event-based</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Availability style</Label><Select value={form.availabilityMode} onValueChange={(value) => setForm({ ...form, availabilityMode: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="appointment">Appointment slots</SelectItem><SelectItem value="window">Availability / location windows</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label>{form.fulfillmentMode === "mobile" ? "Service area" : "Location"}</Label><Input value={form.fulfillmentMode === "mobile" ? form.serviceArea : form.locationText} onChange={(e) => setForm({ ...form, [form.fulfillmentMode === "mobile" ? "serviceArea" : "locationText"]: e.target.value })} placeholder={form.fulfillmentMode === "mobile" ? "Cities, ZIPs, or travel radius" : "Address or pickup location"} /></div>
            <div className="space-y-1.5"><Label>Booking window (days)</Label><Input type="number" min="1" value={form.bookingWindowDays} onChange={(e) => setForm({ ...form, bookingWindowDays: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Minimum notice (hours)</Label><Input type="number" min="0" value={form.leadTimeHours} onChange={(e) => setForm({ ...form, leadTimeHours: e.target.value })} /></div>
          </div>
          <div className="mt-5 rounded-xl border border-dashed p-4">
            <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Availability windows</p><p className="text-xs text-muted-foreground">Useful for appointments, food-truck stops, pickup windows, and event availability.</p></div><Button type="button" variant="outline" size="sm" onClick={addWindow}><Plus className="mr-1 h-4 w-4" /> Add window</Button></div>
            <div className="mt-3 space-y-2">
              {form.availability.map((window, index) => (
                <div key={`${window.day}-${index}`} className="grid gap-2 sm:grid-cols-[100px_1fr_1fr_1fr_auto]">
                  <Select value={window.day} onValueChange={(value) => setForm({ ...form, availability: form.availability.map((item, i) => i === index ? { ...item, day: value } : item) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DAYS.map((day) => <SelectItem key={day} value={day}>{day}</SelectItem>)}</SelectContent></Select>
                  <Input type="time" value={window.start} onChange={(e) => setForm({ ...form, availability: form.availability.map((item, i) => i === index ? { ...item, start: e.target.value } : item) })} />
                  <Input type="time" value={window.end} onChange={(e) => setForm({ ...form, availability: form.availability.map((item, i) => i === index ? { ...item, end: e.target.value } : item) })} />
                  <Input placeholder="Optional stop/location" value={window.location || ""} onChange={(e) => setForm({ ...form, availability: form.availability.map((item, i) => i === index ? { ...item, location: e.target.value } : item) })} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => setForm({ ...form, availability: form.availability.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
                </div>
              ))}
            </div>
          </div>
          <Button className="mt-5" disabled={!form.name.trim() || saveService.isPending} onClick={() => saveService.mutate()}>{saveService.isPending ? "Saving…" : editing ? "Save service" : "Add service"}</Button>
        </section>

         <section>
          <div className="mb-4 flex items-end justify-between"><div><h2 className="text-xl font-bold">Your services</h2><p className="mt-1 text-sm text-muted-foreground">Each service has its own booking method.</p></div><span className="text-xs text-muted-foreground">{services.length} configured</span></div>
          {servicesLoading ? <p className="text-sm text-muted-foreground">Loading services…</p> : services.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Add your first service above.</div> : <div className="grid gap-3 md:grid-cols-2">{services.map((service) => <article key={service.id} className="rounded-2xl border bg-card p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{service.name}</h3><p className="mt-1 text-xs text-muted-foreground">{service.description || "No description yet."}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${service.active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>{service.active ? "Live" : "Hidden"}</span></div><div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="rounded-full bg-muted px-2 py-1">{modeLabel(service.confirmation_mode)}</span><span className="rounded-full bg-muted px-2 py-1">{service.pricing_mode === "starting_at" ? `From ${money(service.price_cents)}` : service.pricing_mode === "fixed" ? money(service.price_cents) : "Quote"}</span><span className="rounded-full bg-muted px-2 py-1">{service.fulfillment_mode.replace("_", " ")}</span></div><div className="mt-4 flex gap-2"><Button variant="outline" size="sm" onClick={() => startEdit(service)}>Edit</Button><Button variant="ghost" size="sm" onClick={() => deleteService.mutate(service.id)} disabled={deleteService.isPending}>Hide</Button></div></article>)}</div>}
        </section>

        <section>
          <div className="mb-4"><h2 className="text-xl font-bold">Upcoming and requested</h2><p className="mt-1 text-sm text-muted-foreground">Customers are identified by Guber ID only. Personal names and usernames are not shown.</p></div>
          {bookingsLoading ? (
            <p className="text-sm text-muted-foreground">Loading bookings…</p>
          ) : bookings.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No bookings yet.</div>
          ) : (
            <div className="space-y-3">
              {bookings.map((booking) => (
                <article key={booking.id} className="rounded-2xl border bg-card p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold">{booking.service_name}</h3>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${statusColor(booking.status)}`}>
                          {booking.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Customer Guber ID: {booking.customer_guber_id || "Guber member"}</p>
                      {booking.requested_start_at && (
                        <p className="mt-1 flex items-center gap-1.5 text-sm">
                          <Clock3 className="h-3.5 w-3.5 text-primary" />
                          {new Date(booking.requested_start_at).toLocaleString()}
                        </p>
                      )}
                      {booking.customer_location && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 text-primary" />
                          {booking.customer_location}
                        </p>
                      )}
                      {booking.customer_note && <p className="mt-3 rounded-lg bg-muted p-3 text-xs leading-relaxed">{booking.customer_note}</p>}
                      {booking.proposal_history?.length > 0 && (
                        <div className="mt-3 rounded-lg border bg-background p-3 text-xs">
                          <p className="font-semibold">Proposed time history</p>
                          <div className="mt-2 space-y-1 text-muted-foreground">
                            {booking.proposal_history.map((proposal, index) => (
                              <p key={`${proposal.createdAt}-${index}`}>{new Date(proposal.startAt).toLocaleString()} · Offered</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {booking.status === "requested" && (
                        <>
                          <Button size="sm" onClick={() => updateBooking.mutate({ id: booking.id, status: "confirmed" })}>
                            <Check className="mr-1 h-4 w-4" /> Accept
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => updateBooking.mutate({ id: booking.id, status: "declined" })}>Decline</Button>
                        </>
                      )}
                      {["requested", "confirmed", "reschedule_proposed"].includes(booking.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRescheduling(rescheduling === booking.id ? null : booking.id);
                            setRescheduleStart(booking.requested_start_at ? new Date(booking.requested_start_at).toISOString().slice(0, 16) : "");
                          }}
                        >
                          Reschedule
                        </Button>
                      )}
                      {booking.status === "confirmed" && (
                        <Button size="sm" variant="outline" onClick={() => updateBooking.mutate({ id: booking.id, status: "completed" })}>Mark completed</Button>
                      )}
                      {!["cancelled", "declined", "completed"].includes(booking.status) && (
                        <Button size="sm" variant="ghost" onClick={() => updateBooking.mutate({ id: booking.id, status: "cancelled" })}>Cancel</Button>
                      )}
                    </div>
                  </div>
                  {rescheduling === booking.id && (
                    <div className="mt-4 flex flex-col gap-2 rounded-xl bg-muted p-3 sm:flex-row sm:items-end">
                      <div className="flex-1">
                        <Label className="text-xs">Proposed date and time</Label>
                        <Input type="datetime-local" value={rescheduleStart} onChange={(e) => setRescheduleStart(e.target.value)} className="mt-1 bg-background" />
                      </div>
                      <Button
                        size="sm"
                        disabled={!rescheduleStart || updateBooking.isPending}
                        onClick={() => {
                          updateBooking.mutate({ id: booking.id, status: "reschedule_proposed", proposedStartAt: rescheduleStart });
                          setRescheduling(null);
                        }}
                      >
                        Send new time
                      </Button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </BizLayout>
  );
}