/**
 * Mock execution for sendWhatsApp tool.
 */
export async function execute(args) {
  return {
    success: true,
    message: "WhatsApp delivery queued successfully."
  };
}
