export interface WheelCandidate {
  id: string;
  label: string;
  /** 내 식당에서 넣은 후보면 식당 id */
  restaurantId?: string;
}

/**
 * index번 칸이 맨 위 화살표에 오도록 하는 다음 회전 각도(도, 시계 방향 누적).
 * 칸 i는 맨 위에서 시계 방향으로 [i*seg, (i+1)*seg] 구간.
 * offset(-0.5~0.5)으로 칸 안에서 멈추는 위치를 살짝 흔들어 자연스럽게.
 */
export function targetRotation(current: number, index: number, count: number, spins = 5, offset = 0): number {
  const seg = 360 / count;
  const center = (index + 0.5 + offset * 0.7) * seg;
  const base = current + spins * 360;
  const need = (((-center - base) % 360) + 360) % 360;
  return base + need;
}

/** 회전 각도에서 지금 맨 위에 있는 칸 번호 */
export function indexAtTop(rotation: number, count: number): number {
  const seg = 360 / count;
  const pos = (((-rotation) % 360) + 360) % 360;
  return Math.floor(pos / seg) % count;
}
