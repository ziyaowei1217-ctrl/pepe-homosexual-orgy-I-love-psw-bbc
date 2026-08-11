type CloseOwner = { close(): Promise<unknown> };

export async function closeOwnedNestLifecycle(options: {
  application?: CloseOwner;
  module?: CloseOwner;
}): Promise<void> {
  if (options.application) {
    await options.application.close();
    return;
  }
  if (options.module) await options.module.close();
}
