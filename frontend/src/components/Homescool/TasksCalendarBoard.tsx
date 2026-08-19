/**

 * Homescool Calendar — Teams-like month / week views via FullCalendar v6.

 *

 * Events expand from assigned tasks (start/end + frequency). Optionally accepts

 * a shared task list from the parent so Calendar and Tasks boards stay in sync.

 */



import { useCallback, useEffect, useMemo, useState } from "react";

import FullCalendar from "@fullcalendar/react";

import dayGridPlugin from "@fullcalendar/daygrid";

import timeGridPlugin from "@fullcalendar/timegrid";

import type { EventClickArg, EventInput } from "@fullcalendar/core";

import {

  expandOccurrenceDates,

  formatFrequencyLabel,

  formatStudyAreas,

  listLearningTasks,

  listTeacherStudentTasks,

  taskStatusLabel,

  type HomescoolTask,

} from "../../lib/homescool";

import "./Homescool.css";

import "./HomescoolCalendar.css";



type Props = {

  mode: "teacher" | "student";

  teacherSlug?: string;

  studentSlug?: string;

  /** Shared assignment list (Dynamo-backed). When set, skips local fetch. */

  tasks?: HomescoolTask[];

  loading?: boolean;

  /** Compact copy when embedded under Learning Home. */

  embedded?: boolean;

};



function tasksToEvents(tasks: HomescoolTask[]): EventInput[] {

  const events: EventInput[] = [];

  for (const task of tasks) {

    const dates = expandOccurrenceDates(

      task.startDate,

      task.endDate || task.startDate,

      task.frequency,

      task.durationMin,

    );

    const areas = formatStudyAreas(task.studyAreas, task.studyArea);

    for (const date of dates) {

      events.push({

        id: `${task.id}:${date}`,

        title: task.name,

        start: date,

        allDay: true,

        extendedProps: {

          taskId: task.id,

          status: task.status,

          frequency: formatFrequencyLabel(task.frequency),

          areas,

        },

        classNames: [`homescool-cal-event--${task.status || "pending"}`],

      });

    }

  }

  return events;

}



export default function TasksCalendarBoard({

  mode,

  teacherSlug = "",

  studentSlug = "",

  tasks: sharedTasks,

  loading: sharedLoading,

  embedded = false,

}: Props) {

  const controlled = sharedTasks !== undefined;

  const [localTasks, setLocalTasks] = useState<HomescoolTask[]>([]);

  const [localLoading, setLocalLoading] = useState(!controlled);



  const reload = useCallback(async () => {

    if (controlled) return;

    setLocalLoading(true);

    try {

      if (mode === "teacher" && studentSlug) {

        const data = await listTeacherStudentTasks(studentSlug);

        setLocalTasks(data.tasks ?? []);

      } else if (mode === "student" && teacherSlug) {

        const data = await listLearningTasks(teacherSlug);

        setLocalTasks(data.tasks ?? []);

      } else {

        setLocalTasks([]);

      }

    } catch {

      setLocalTasks([]);

    } finally {

      setLocalLoading(false);

    }

  }, [controlled, mode, studentSlug, teacherSlug]);



  useEffect(() => {

    void reload();

  }, [reload]);



  const tasks = controlled ? sharedTasks : localTasks;

  const loading = controlled ? Boolean(sharedLoading) : localLoading;

  const events = useMemo(() => tasksToEvents(tasks), [tasks]);



  function onEventClick(info: EventClickArg) {

    const taskId = String(info.event.extendedProps.taskId ?? "");

    if (!taskId || typeof window === "undefined") return;

    const url = new URL(window.location.href);

    url.searchParams.set("folder", "tasks");

    url.searchParams.set("task", taskId);

    window.location.assign(url.toString());

  }



  return (

    <div className={`homescool-calendar${embedded ? " homescool-calendar--embedded" : ""}`}>

      {!embedded ? (

        <p className="homescool-tasks__legend">

          Month and week views of this student&apos;s assignments. Blocks expand from each task&apos;s

          frequency inside the start–end window. One board card still equals one assignment

          (submit/grade once).

        </p>

      ) : null}

      {loading ? <p className="homescool-empty">Loading calendar…</p> : null}

      {!loading && events.length === 0 ? (

        <p className="homescool-empty">No scheduled task occurrences yet.</p>

      ) : null}

      <div className="homescool-calendar__frame">

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

          eventClick={onEventClick}

          dayMaxEvents={3}

          nowIndicator

          eventDidMount={(info) => {

            const status = String(info.event.extendedProps.status ?? "");

            const freq = String(info.event.extendedProps.frequency ?? "");

            const areas = String(info.event.extendedProps.areas ?? "");

            info.el.title = [

              info.event.title,

              status ? taskStatusLabel(status as HomescoolTask["status"]) : "",

              freq,

              areas,

            ]

              .filter(Boolean)

              .join(" · ");

          }}

        />

      </div>

    </div>

  );

}


