declare module 'clipper-lib' {
  export interface IntPoint {
    X: number
    Y: number
  }
  export type Path = IntPoint[]
  export type Paths = Path[]

  export const JoinType: { jtSquare: number; jtRound: number; jtMiter: number }
  export const EndType: {
    etClosedPolygon: number
    etClosedLine: number
    etOpenButt: number
    etOpenSquare: number
    etOpenRound: number
  }
  export const PolyType: { ptSubject: number; ptClip: number }
  export const PolyFillType: {
    pftEvenOdd: number
    pftNonZero: number
    pftPositive: number
    pftNegative: number
  }
  export const ClipType: {
    ctIntersection: number
    ctUnion: number
    ctDifference: number
    ctXor: number
  }

  export class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number)
    AddPaths(paths: Paths, joinType: number, endType: number): void
    AddPath(path: Path, joinType: number, endType: number): void
    Execute(solution: Paths, delta: number): void
  }

  export class Clipper {
    static CleanPolygons(paths: Paths, distance?: number): Paths
    static PointInPolygon(point: IntPoint, path: Path): number
    constructor()
    AddPaths(paths: Paths, polyType: number, closed: boolean): void
    AddPath(path: Path, polyType: number, closed: boolean): void
    Execute(
      clipType: number,
      solution: Paths,
      subjFillType?: number,
      clipFillType?: number,
    ): boolean
  }
}
