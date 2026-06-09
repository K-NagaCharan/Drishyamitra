/**
 * Mock execution for requestZipConfirmation tool.
 */
export async function execute(args) {
  return {
    requiresConfirmation: true,
    estimatedSizeMB: args?.estimatedSizeMB,
    deliveryMethod: args?.deliveryMethod
  };
}
