/**
 * Every observed element reports `intersecting`, which defaults to on screen;
 * tests that need a hidden surface flip it with `setIntersecting`.
 */
export class TestIntersectionObserver {
  static intersecting = true;
  private static readonly live = new Set<TestIntersectionObserver>();
  private readonly targets = new Set<Element>();

  constructor(private readonly callback: IntersectionObserverCallback) {}

  static setIntersecting(intersecting: boolean): void {
    TestIntersectionObserver.intersecting = intersecting;
    for (const observer of TestIntersectionObserver.live) observer.report();
  }

  observe(target: Element): void {
    this.targets.add(target);
    TestIntersectionObserver.live.add(this);
    this.report();
  }

  disconnect(): void {
    this.targets.clear();
    TestIntersectionObserver.live.delete(this);
  }

  private report(): void {
    const isIntersecting = TestIntersectionObserver.intersecting;
    const entries = [...this.targets].map(
      (target) => ({ isIntersecting, target }) as IntersectionObserverEntry,
    );
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}
