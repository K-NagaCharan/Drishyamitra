/**
 * Mock execution for sendEmail tool.
 */
export async function execute(args) {
  return {
    success: true,
    message: "Email queued successfully."
  };
}
