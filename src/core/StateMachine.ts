export interface StateHandlers<O> {
  enter?: (owner: O) => void;
  update?: (owner: O, dt: number) => void;
  exit?: (owner: O) => void;
}

/** Máy trạng thái tối giản: mỗi trạng thái có enter / update / exit. */
export class StateMachine<S extends string, O> {
  private current: S;
  private elapsed = 0;
  private readonly owner: O;
  private readonly states: Record<S, StateHandlers<O>>;

  constructor(owner: O, states: Record<S, StateHandlers<O>>, initial: S) {
    this.owner = owner;
    this.states = states;
    this.current = initial;
    this.states[initial].enter?.(owner);
  }

  get state(): S {
    return this.current;
  }

  get timeInState(): number {
    return this.elapsed;
  }

  go(next: S): void {
    if (next === this.current) return;
    this.states[this.current].exit?.(this.owner);
    this.current = next;
    this.elapsed = 0;
    this.states[next].enter?.(this.owner);
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.states[this.current].update?.(this.owner, dt);
  }
}
