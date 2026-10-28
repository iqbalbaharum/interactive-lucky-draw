export type Winner = { fullName: string; maskedPhone: string };
export type ActiveDraw = { id: number; startedAt: string; shotAt: string | null; eligibleCount: number; status: 'flocking' | 'reserved'; winner: Winner | null };
export type PublicStatus = { eligibleCount: number; totalCount: number; eligibleNames: string[]; activeDraw: ActiveDraw | null };

import type { RowDataPacket } from 'mysql2';

export type ParticipantRow = RowDataPacket & {
  id: number; full_name: string; phone: string; ic_number: string; registered_at: string; winner_draw_id: number | null;
};

export type DrawRow = RowDataPacket & {
  id: number; participant_id: number | null; winner_name: string | null; winner_phone: string | null; eligible_count: number;
  status: 'flocking' | 'reserved' | 'completed'; started_at: string; shot_at: string | null; completed_at: string | null; invalidated_at: string | null;
};
