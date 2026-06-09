/**
 * Format the raw response from the Agent Loop into a presentation-ready
 * payload for the frontend.
 *
 * @param {object} result - The raw output from the agent loop.
 * @returns {object} The formatted output: { reply, cards }
 */
export function formatAgentResponse(result) {
  let cards = undefined;

  if (result && Array.isArray(result.toolCalls)) {
    const searchPhotosCall = result.toolCalls.find(tc => tc.name === "searchPhotos");
    if (searchPhotosCall) {
      cards = [];
      if (Array.isArray(searchPhotosCall.result)) {
        searchPhotosCall.result.forEach(photo => {
          // Map fields to presentational schema
          cards.push({
            type: "photo",
            id: photo.id,
            thumbnailUrl: photo.url || "",
            people: photo.people || [],
            person: photo.people && photo.people.length > 0 ? photo.people.join(", ") : "Unknown",
            date: photo.date || ""
          });
        });
      }
    }
  }

  return {
    reply: result.reply || "",
    ...(cards !== undefined ? { cards } : {})
  };
}
