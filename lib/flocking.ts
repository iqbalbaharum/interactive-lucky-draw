export type FlyingDuck = {
  x: number;
  y: number;
  heading: number;
  speed: number;
  scale: number;
  launchDelay: number;
};

const TAU = Math.PI * 2;
const STEP = 1 / 60;
const NEIGHBOR_RADIUS = 52;
const SEPARATION_RADIUS = 15;
const TURN_RATE = Math.PI / 40 * 60;
const seeded = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};
const wrap = (value: number, size: number) => ((value % size) + size) % size;
// The signed shortest difference handles both angle and screen-edge wrapping.
const difference = (value: number, size: number) => wrap(value + size / 2, size) - size / 2;

/** Fixed-step steering keeps flight independent of display refresh rate and polling. */
export class FlockSimulation {
  readonly birds: FlyingDuck[];
  private tick = 0;
  private readonly skyHeight: number;
  private readonly columns: number;
  private readonly rows: number;
  private readonly cellWidth: number;
  private readonly cellHeight: number;

  constructor(count: number, readonly width: number, readonly ground: number, seed: number) {
    this.skyHeight = Math.max(60, ground - 24);
    this.columns = Math.max(1, Math.floor(width / NEIGHBOR_RADIUS));
    this.rows = Math.max(1, Math.floor(this.skyHeight / NEIGHBOR_RADIUS));
    this.cellWidth = width / this.columns;
    this.cellHeight = this.skyHeight / this.rows;
    this.birds = Array.from({ length: count }, (_, index) => {
      const key = index + seed * 1009;
      return {
        x: 8 + seeded(key + 31) * (width - 24), y: this.skyHeight - 3 - seeded(key + 41) * 6,
        heading: -Math.PI / 2 + (seeded(key + 13) - .5) * 2.6,
        speed: 110 + seeded(key + 7) * 150, scale: .65 + seeded(key + 101) * .45,
        launchDelay: seeded(key + 97) * .22,
      };
    });
  }

  advanceTo(seconds: number) {
    const targetTick = Math.floor(Math.max(0, Math.min(2.5, seconds)) / STEP);
    while (this.tick < targetTick) { this.step(); this.tick++; }
    return this.birds;
  }

  private step() {
    const time = this.tick * STEP;
    const grid: number[][] = Array.from({ length: this.columns * this.rows }, () => []);
    const headings = new Float64Array(this.birds.length);
    const radiusSquared = NEIGHBOR_RADIUS ** 2;
    const separationSquared = SEPARATION_RADIUS ** 2;
    for (let i = 0; i < this.birds.length; i++) {
      const bird = this.birds[i];
      if (time < bird.launchDelay) continue;
      const column = Math.floor(wrap(bird.x, this.width) / this.cellWidth);
      const row = Math.floor(wrap(bird.y, this.skyHeight) / this.cellHeight);
      grid[row * this.columns + column].push(i);
    }
    for (let i = 0; i < this.birds.length; i++) {
      const bird = this.birds[i];
      headings[i] = bird.heading;
      if (time < bird.launchDelay) continue;
      const column = Math.floor(wrap(bird.x, this.width) / this.cellWidth);
      const row = Math.floor(wrap(bird.y, this.skyHeight) / this.cellHeight);
      let closestDistance = radiusSquared;
      let nearestX = 0, nearestY = 0, nearestHeading = bird.heading;
      let separateX = 0, separateY = 0;
      // Spatial buckets restrict neighbor work for the 600-duck case.
      const visited = new Set<number>();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cell = wrap(row + dy, this.rows) * this.columns + wrap(column + dx, this.columns);
        if (visited.has(cell)) continue;
        visited.add(cell);
        for (const otherIndex of grid[cell]) {
          if (i === otherIndex) continue;
          const other = this.birds[otherIndex];
          const x = difference(other.x - bird.x, this.width);
          const y = difference(other.y - bird.y, this.skyHeight);
          const distanceSquared = x * x + y * y;
          if (distanceSquared < closestDistance) {
            closestDistance = distanceSquared; nearestX = x; nearestY = y; nearestHeading = other.heading;
          }
          if (distanceSquared < separationSquared) {
            const distance = Math.sqrt(distanceSquared);
            if (distance > .001) {
              const force = (1 - distance / SEPARATION_RADIUS);
              separateX -= x / distance * force;
              separateY -= y / distance * force;
            } else {
              // Distinct escape directions keep coincident birds from sticking together.
              separateX += Math.cos(i * 2.4); separateY += Math.sin(i * 2.4);
            }
          }
        }
      }
      const age = time - bird.launchDelay;
      const launch = Math.max(0, 1 - age / .65);
      let steerX = Math.cos(bird.heading) * .9 + separateX * 1.7;
      let steerY = Math.sin(bird.heading) * .9 + separateY * 1.7 - launch * 1.4;
      if (closestDistance < radiusSquared) {
        // Follow the closest neighbor, while matching its direction and leaving room.
        const distance = Math.sqrt(closestDistance);
        const attraction = distance > SEPARATION_RADIUS ? .65 : 0;
        steerX += nearestX / Math.max(1, distance) * attraction + Math.cos(nearestHeading) * .6;
        steerY += nearestY / Math.max(1, distance) * attraction + Math.sin(nearestHeading) * .6;
      }
      const wander = bird.heading + Math.sin(time * 2 + i * .71) * .8;
      steerX += Math.cos(wander) * .25;
      steerY += Math.sin(wander) * .25;
      const desired = Math.atan2(steerY, steerX);
      const turn = difference(desired - bird.heading, TAU);
      headings[i] = bird.heading + Math.max(-TURN_RATE * STEP, Math.min(TURN_RATE * STEP, turn));
    }
    // Apply all changes together, so iteration order never influences neighbor reads.
    for (let i = 0; i < this.birds.length; i++) {
      const bird = this.birds[i];
      if (time < bird.launchDelay) continue;
      bird.heading = headings[i];
      bird.x = wrap(bird.x + Math.cos(bird.heading) * bird.speed * STEP, this.width);
      bird.y = wrap(bird.y + Math.sin(bird.heading) * bird.speed * STEP, this.skyHeight);
    }
  }
}
