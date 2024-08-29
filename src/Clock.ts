type CallbackFunction = () => void;

export default class Clock {
  private targetFPS: number;
  private callback: CallbackFunction;
  private targetFrameTime: number;
  private lastFrameTime: number;
  private running: boolean;

  constructor(fps: number, callback: CallbackFunction) {
    this.targetFPS = fps;
    this.callback = callback;
    this.targetFrameTime = 1000 / this.targetFPS;
    this.lastFrameTime = performance.now();
    this.running = false;
  }

  start(): void {
    this.running = true;
    requestAnimationFrame(this.frame.bind(this));
  }

  stop(): void {
    this.running = false;
  }

  private frame(time: number): void {
    if (!this.running) return;
    const delta = time - this.lastFrameTime;

    if (delta > this.targetFrameTime) {
      this.lastFrameTime = time - (delta % this.targetFrameTime);
      this.callback();
    }
    requestAnimationFrame(this.frame.bind(this));
  }
}
