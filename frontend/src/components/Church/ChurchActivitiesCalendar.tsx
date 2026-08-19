/**
 * FullCalendar v6 — church activity month/week views (Homescool pattern).
 */

import { useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { EventInput } from "@fullcalendar/core";
import type { ChurchActivity } from "../../lib/church";
import "./Church.css";

type Props = {
  activities: ChurchActivity[];
  onSelect?: (activityId: string) => void;
};

function toEvents(activities: ChurchActivity[]): EventInput[] {
  const events: EventInput[] = [];
  for (const act of activities) {
    const start = act.startDate || act.createdAt?.slice(0, 10);
    if (!start) continue;
    events.push({
      id: act.id,
      title: act.title,
      start,
      end: act.endDate || undefined,
      allDay: true,
      extendedProps: { sector: act.sector || "" },
    });
  }
  return events;
}

export default function ChurchActivitiesCalendar({ activities, onSelect }: Props) {
  const events = useMemo(() => toEvents(activities), [activities]);

  return (
    <div className="church-calendar">
      <h2 className="church-page__title" style={{ fontSize: "1.25rem" }}>
        Activity calendar
      </h2>
      <p className="church-page__lead">
        Month and week views of planned activities (FullCalendar v6).
      </p>
      {events.length === 0 ? (
        <p className="church-empty">No scheduled activities yet.</p>
      ) : null}
      <div className="church-calendar__frame">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek",
          }}
          height="auto"
          events={events}
          dayMaxEvents={3}
          nowIndicator
          eventClick={(info) => {
            onSelect?.(info.event.id);
          }}
        />
      </div>
    </div>
  );
}
