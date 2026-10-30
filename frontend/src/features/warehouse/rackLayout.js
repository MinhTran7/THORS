export const RACK_WIDTH = 190;
export const RACK_GAP = 24;
export const RACK_HEADER = 72;
export const RACK_FOOTER = 48;
export const RACK_TIER = 40;
export const RACK_TIER_GAP = 4;
export const RACK_PADDING = 12;
export const MAX_COORDINATE = 1800;

const EPSILON = 0.005;
const round = (v) => Math.round(v * 100) / 100;

export function rackHeight(count) {
  return (
    2 +
    RACK_HEADER +
    RACK_PADDING +
    Math.max(0, count * (RACK_TIER + RACK_TIER_GAP) - RACK_TIER_GAP) +
    RACK_FOOTER
  );
}

export function rackBounds(rack, tiers) {
  const coordinate = (v) =>
    Math.max(
      0,
      Math.min(
        MAX_COORDINATE,
        Number.isFinite(Number(v)) ? round(Number(v)) : 40
      )
    );

  return {
    ...rack,
    x: coordinate(rack.coordinate_x),
    y: coordinate(rack.coordinate_y),
    width: RACK_WIDTH,
    height: rackHeight(
      tiers.filter((t) => t.rack_id === rack.rack_id).length
    )
  };
}

export function racksOverlap(a, b) {
  return (
    a.x < b.x + b.width + RACK_GAP - EPSILON &&
    a.x + a.width + RACK_GAP > b.x + EPSILON &&
    a.y < b.y + b.height + RACK_GAP - EPSILON &&
    a.y + a.height + RACK_GAP > b.y + EPSILON
  );
}

export function findCollision(candidate, racks) {
  return racks.find(
    (r) =>
      r.rack_id !== candidate.rack_id &&
      racksOverlap(candidate, r)
  );
}

export function findFreePosition(preferred, occupied) {
  if (!findCollision(preferred, occupied)) {
    return { x: preferred.x, y: preferred.y };
  }

  const xs = new Set([preferred.x, 0, 40]);
  const ys = new Set([preferred.y, 0, 40]);

  for (const r of occupied) {
    xs.add(round(r.x + r.width + RACK_GAP));
    xs.add(round(r.x - preferred.width - RACK_GAP));
    ys.add(round(r.y + r.height + RACK_GAP));
    ys.add(round(r.y - preferred.height - RACK_GAP));
  }

  let best = null;

  for (const x of xs) {
    for (const y of ys) {
      if (
        x < 0 ||
        y < 0 ||
        x > MAX_COORDINATE ||
        y > MAX_COORDINATE
      ) {
        continue;
      }

      const candidate = { ...preferred, x, y };
      if (findCollision(candidate, occupied)) continue;

      const distance =
        (x - preferred.x) ** 2 +
        (y - preferred.y) ** 2;

      const rowDistance = Math.abs(y - preferred.y);

      if (
        !best ||
        rowDistance < best.rowDistance - EPSILON ||
        (
          Math.abs(rowDistance - best.rowDistance) <= EPSILON &&
          (
            distance < best.distance - EPSILON ||
            (
              Math.abs(distance - best.distance) <= EPSILON &&
              (
                y < best.y ||
                (y === best.y && x < best.x)
              )
            )
          )
        )
      ) {
        best = { x, y, distance, rowDistance };
      }
    }
  }

  return best ? { x: best.x, y: best.y } : null;
}

export function buildRackLayout(racks, tiers) {
  const sorted = racks
    .map((r) => rackBounds(r, tiers))
    .sort((a, b) => a.rack_id - b.rack_id);

  const placed = [];
  const deferred = [];

  for (const r of sorted) {
    (findCollision(r, placed) ? deferred : placed).push(r);
  }

  for (const r of deferred) {
    const free = findFreePosition(r, placed);

    if (!free) {
      throw new Error(
        'Sơ đồ không còn đủ khoảng trống trong vùng tọa độ 0–1800.'
      );
    }

    placed.push({ ...r, ...free });
  }

  return racks.map(
    (r) => placed.find((p) => p.rack_id === r.rack_id)
  );
}

export function relativePlacement(candidate, racks, referenceId, direction) {
  const others = racks.filter(
    (r) => r.rack_id !== candidate.rack_id
  );

  if (direction === 'KEEP') {
    return { candidate, racks, shifted: false };
  }

  if (!others.length) {
    return {
      candidate: { ...candidate, x: 40, y: 40 },
      racks: [],
      shifted: false
    };
  }

  const reference = others.find(
    (r) => r.rack_id === Number(referenceId)
  );

  if (!reference) {
    throw new Error('Hãy chọn kệ làm mốc.');
  }

  let x = reference.x;
  let y = reference.y;

  if (direction === 'RIGHT') {
    x += reference.width + RACK_GAP;
  } else if (direction === 'LEFT') {
    x -= candidate.width + RACK_GAP;
  } else if (direction === 'BELOW') {
    y += reference.height + RACK_GAP;
  } else if (direction === 'ABOVE') {
    y -= candidate.height + RACK_GAP;
  } else {
    throw new Error('Hãy chọn hướng đặt kệ.');
  }

  const dx = Math.max(0, 40 - x);
  const dy = Math.max(0, 40 - y);

  const shifted = others.map((r) => ({
    ...r,
    x: round(r.x + dx),
    y: round(r.y + dy)
  }));

  const next = {
    ...candidate,
    x: round(x + dx),
    y: round(y + dy)
  };

  if (
    [...shifted, next].some(
      (r) => r.x > MAX_COORDINATE || r.y > MAX_COORDINATE
    )
  ) {
    throw new Error(
      'Không đủ chỗ theo hướng này. Hãy chọn hướng khác hoặc xếp gọn kho.'
    );
  }

  const conflict = findCollision(next, shifted);

  if (conflict) {
    throw new Error(
      `Vị trí này đã có kệ ${conflict.rack_code}. Hãy chọn hướng hoặc kệ làm mốc khác.`
    );
  }

  return {
    candidate: next,
    racks: shifted,
    shifted: dx > 0 || dy > 0
  };
}

export function snapRack(candidate, racks) {
  const others = racks.filter(
    (r) => r.rack_id !== candidate.rack_id
  );

  const xs = [40];
  const ys = [40];

  for (const r of others) {
    xs.push(
      r.x,
      r.x + r.width + RACK_GAP,
      r.x - candidate.width - RACK_GAP
    );

    ys.push(
      r.y,
      r.y + r.height + RACK_GAP,
      r.y - candidate.height - RACK_GAP
    );
  }

  const nearest = (value, targets) =>
    targets
      .filter(
        (t) =>
          t >= 0 &&
          t <= MAX_COORDINATE &&
          Math.abs(t - value) <= 20
      )
      .sort(
        (a, b) => Math.abs(a - value) - Math.abs(b - value)
      )[0] ?? value;

  const x = nearest(candidate.x, xs);
  const y = nearest(candidate.y, ys);

  for (const point of [
    { x, y },
    { x, y: candidate.y },
    { x: candidate.x, y }
  ]) {
    if (!findCollision({ ...candidate, ...point }, others)) {
      return point;
    }
  }

  return { x: candidate.x, y: candidate.y };
}