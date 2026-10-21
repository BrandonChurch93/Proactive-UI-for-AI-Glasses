import type { GateState, VehicleInfo, WorldSnapshot } from '@lumen/shared';
import type { Config } from './config';

export interface GateInput {
  snoozed: boolean;
  budget: number;
  forceSafety: boolean;
}

export function threat(snap: WorldSnapshot, cfg: Config): VehicleInfo | undefined {
  return snap.env.vehicles.find(
    (v) => v.timeToPath !== undefined && v.timeToPath < cfg.safety.vehicleTimeToPath && v.kind !== 'bike',
  );
}

export function bikeBehind(snap: WorldSnapshot, cfg: Config): VehicleInfo | undefined {
  return snap.env.vehicles.find(
    (v) =>
      v.kind === 'bike' &&
      v.fromBehind === true &&
      v.wearerSide === true &&
      v.timeToPath !== undefined &&
      v.timeToPath < cfg.safety.vehicleTimeToPath,
  );
}

export function computeGates(snap: WorldSnapshot, inp: GateInput, cfg: Config): GateState {
  const crossing = snap.wearer.state === 'crossing';
  const roadway = snap.env.crosswalk?.inRoadway === true;
  const vehicle = threat(snap, cfg) !== undefined || bikeBehind(snap, cfg) !== undefined;
  const g: GateState = {
    safety: crossing || roadway || vehicle || inp.forceSafety,
    social: snap.social.inConversation,
    path: snap.env.people.some((p) => p.onPath),
    snooze: inp.snoozed,
    budgetEmpty: inp.budget <= 0,
  };
  if (crossing) g.safetyCause = 'crossing';
  else if (roadway) g.safetyCause = 'roadway';
  else if (vehicle || inp.forceSafety) g.safetyCause = 'vehicle';
  return g;
}

export function gateList(g: GateState): string[] {
  const out: string[] = [];
  if (g.safety) out.push(`safety:${g.safetyCause ?? 'on'}`);
  if (g.social) out.push('social');
  if (g.path) out.push('path');
  if (g.snooze) out.push('snooze');
  if (g.budgetEmpty) out.push('budget');
  return out;
}
