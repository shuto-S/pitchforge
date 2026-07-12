export class RetryableSingleFlight {
  private active: Promise<void> | null = null;

  async run(operation: () => Promise<void>): Promise<void> {
    let current = this.active;
    if (!current) {
      current = Promise.resolve().then(operation);
      this.active = current;
    }

    try {
      await current;
    } catch (error) {
      if (this.active === current) {
        this.active = null;
      }
      throw error;
    }
  }
}
