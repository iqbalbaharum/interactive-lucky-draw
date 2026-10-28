export type Winner = { fullName: string; maskedPhone: string };
export type ActiveDraw = { id: number; startedAt: string; eligibleCount: number; winner: Winner };
export type PublicStatus = { eligibleCount: number; totalCount: number; eligibleNames: string[]; activeDraw: ActiveDraw | null };

import type { RowDataPacket } from 'mysql2';

export type ParticipantRow = RowDataPacket & {
  id: number; full_name: string; phone: string; ic_number: string; registered_at: string; winner_draw_id: number | null;
};

export type DrawRow = RowDataPacket & {
  id: number; participant_id: number; winner_name: string; winner_phone: string; eligible_count: number;
  status: 'reserved' | 'completed'; started_at: string; completed_at: string | null; invalidated_at: string | null;
};
