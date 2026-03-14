import { json } from "@sveltejs/kit";
import { attendanceDb, batchDb, batchItemDb } from "$lib/server/db.js";
import type { AttendanceType } from "$lib/types.js";
import type { RequestHandler } from "./$types.js";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function resolveMonthKey(raw: string | null | undefined, fallbackIso?: string): string {
  if (raw && MONTH_PATTERN.test(raw)) {
    return raw;
  }
  if (fallbackIso) {
    const parsed = new Date(fallbackIso);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
    }
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthToParts(monthKey: string): { year: number; monthIndex: number } {
  const [yearStr, monthStr] = monthKey.split("-");
  return {
    year: Number(yearStr),
    monthIndex: Number(monthStr) - 1,
  };
}

function getDatesByWeekday(monthKey: string, weekday: number): string[] {
  const { year, monthIndex } = monthToParts(monthKey);
  const dates: string[] = [];
  const cursor = new Date(year, monthIndex, 1);
  while (cursor.getMonth() === monthIndex) {
    if (cursor.getDay() === weekday) {
      dates.push(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`,
      );
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function isValidType(value: unknown): value is AttendanceType {
  return value === "saturday" || value === "wednesday";
}

function isDateTypeMatch(dateValue: string, attendanceType: AttendanceType): boolean {
  const parsed = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  const day = parsed.getDay();
  if (attendanceType === "saturday") return day === 6;
  return day === 3;
}

export const GET: RequestHandler = async ({ params, url }) => {
  try {
    const batchId = Number(params.id);
    if (!Number.isInteger(batchId) || batchId <= 0) {
      return json({ error: "Invalid batch id" }, { status: 400 });
    }

    const batch = batchDb.getById(batchId);
    if (!batch) {
      return json({ error: "Batch not found" }, { status: 404 });
    }

    if (batch.type === "special") {
      return json(
        { error: "Special batch does not use attendance" },
        { status: 400 },
      );
    }

    const monthKey = resolveMonthKey(url.searchParams.get("month"), batch.created_at);
    const saturdayDates = getDatesByWeekday(monthKey, 6);
    const wednesdayDates = getDatesByWeekday(monthKey, 3);
    const monthPrefix = `${monthKey}-`;

    const allRecords = attendanceDb.getByBatchId(batchId);
    const records = allRecords.filter((record) =>
      String(record.attendance_date || "").startsWith(monthPrefix),
    );

    const items = batchItemDb.getByBatchId(batchId).map((item) => ({
      id: item.id,
      recipient_id: item.recipient_id,
      recipient_name: item.recipient_name,
      transfer_to_name: item.transfer_to_name,
      family_group_id: item.family_group_id,
      zoom_type: item.zoom_type,
      saturdays_attended: item.saturdays_attended,
      wednesdays_attended: item.wednesdays_attended,
      amount: item.amount,
    }));

    return json({
      batch,
      month: monthKey,
      dates: {
        saturday: saturdayDates,
        wednesday: wednesdayDates,
      },
      items,
      records,
    });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    return json({ error: "Failed to fetch attendance" }, { status: 500 });
  }
};

export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    const batchId = Number(params.id);
    if (!Number.isInteger(batchId) || batchId <= 0) {
      return json({ error: "Invalid batch id" }, { status: 400 });
    }

    const batch = batchDb.getById(batchId);
    if (!batch) {
      return json({ error: "Batch not found" }, { status: 404 });
    }

    if (batch.type === "special") {
      return json(
        { error: "Special batch does not use attendance" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const recipientId = Number(body.recipient_id);
    const attendanceType = body.attendance_type as AttendanceType;
    const attendanceDate = String(body.attendance_date || "").trim();
    const attended = body.attended ? 1 : 0;

    if (!Number.isInteger(recipientId) || recipientId <= 0) {
      return json({ error: "recipient_id is required" }, { status: 400 });
    }
    if (!isValidType(attendanceType)) {
      return json({ error: "attendance_type must be saturday or wednesday" }, { status: 400 });
    }
    if (!DATE_PATTERN.test(attendanceDate)) {
      return json({ error: "attendance_date must use YYYY-MM-DD format" }, { status: 400 });
    }
    if (!isDateTypeMatch(attendanceDate, attendanceType)) {
      return json({ error: "attendance_date does not match attendance_type" }, { status: 400 });
    }

    const itemExists = batchItemDb
      .getByBatchId(batchId)
      .some((item) => item.recipient_id === recipientId);
    if (!itemExists) {
      return json(
        { error: "Recipient is not part of this batch. Populate batch recipients first." },
        { status: 404 },
      );
    }

    const updated = attendanceDb.upsert(
      batchId,
      recipientId,
      attendanceType,
      attendanceDate,
      attended,
      batch,
    );

    if (!updated) {
      return json({ error: "Failed to sync attendance" }, { status: 500 });
    }

    return json({
      recipient_id: updated.recipient_id,
      saturdays_attended: updated.saturdays_attended,
      wednesdays_attended: updated.wednesdays_attended,
      amount: updated.amount,
      attended,
    });
  } catch (error) {
    console.error("Error updating attendance:", error);
    return json({ error: "Failed to update attendance" }, { status: 500 });
  }
};
