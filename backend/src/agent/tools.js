/**
 * Tool definitions for the AI Agent loop.
 * These are Groq-compatible JSON Schema tool specifications.
 */
export const TOOLS = [
  {
    type: "function",
    function: {
      name: "searchPhotos",
      description: "Search the user's photo collection using structured filters.",
      parameters: {
        type: "object",
        properties: {
          people: {
            type: "array",
            items: {
              type: "string"
            },
            description: "Names of labeled people to filter photos by."
          },
          fromDate: {
            type: "string",
            description: "Start date for filtering photos in ISO format (YYYY-MM-DD). Optional. Omit this parameter if no date/time range is specified in the user's request."
          },
          toDate: {
            type: "string",
            description: "End date for filtering photos in ISO format (YYYY-MM-DD). Optional. Omit this parameter if no date/time range is specified in the user's request."
          },
          location: {
            type: "string",
            description: "Location name where photos were taken."
          },
          event: {
            type: "string",
            description: "Event description or name associated with photos."
          }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getPeople",
      description: "Return the list of labeled people belonging to the authenticated user.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "sendEmail",
      description: "Send photos via email. If the user refers to 'these photos', 'them', or the most recent search results, photoIds may be omitted and the backend will automatically resolve them using the user's latest photo search.",
      parameters: {
        type: "object",
        properties: {
          photoIds: {
            type: "array",
            items: {
              type: "string"
            },
            description: "Array of MongoDB photo IDs to email. Omit this parameter if the user refers to previously searched/found photos (e.g. 'these', 'them', 'the photos')."
          },
          email: {
            type: "string",
            format: "email",
            description: "The recipient's email address."
          },
          format: {
            type: "string",
            enum: ["links", "zip"],
            description: "Specify the delivery format. Choose 'zip' if the user explicitly requested a ZIP file or compressed archive. Choose 'links' for standard individual links."
          }
        },
        required: ["email"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "sendWhatsApp",
      description: "Send photos through WhatsApp. If the user refers to 'these photos', 'them', or the most recent search results, photoIds may be omitted and the backend will automatically resolve them using the user's latest photo search.",
      parameters: {
        type: "object",
        properties: {
          photoIds: {
            type: "array",
            items: {
              type: "string"
            },
            description: "Array of MongoDB photo IDs to send. Omit this parameter if the user refers to previously searched/found photos (e.g. 'these', 'them', 'the photos')."
          },
          phoneNumber: {
            type: "string",
            description: "The recipient's WhatsApp phone number in international format."
          },
          format: {
            type: "string",
            enum: ["links", "zip"],
            description: "Specify the delivery format. Choose 'zip' if the user explicitly requested a ZIP file or compressed archive. Choose 'links' for standard individual links."
          }
        },
        required: ["phoneNumber"],
        additionalProperties: false
      }
    }
  },

  {
    type: "function",
    function: {
      name: "requestZipConfirmation",
      description: "Ask the frontend whether the user approves ZIP compression when delivery exceeds platform limits.",
      parameters: {
        type: "object",
        properties: {
          deliveryMethod: {
            type: "string",
            enum: ["email", "whatsapp"],
            description: "The delivery method chosen by the user."
          },
          estimatedSizeMB: {
            type: "number",
            description: "The estimated total size in megabytes of the photos to be sent."
          }
        },
        required: ["deliveryMethod", "estimatedSizeMB"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "confirmZipDelivery",
      description: "Confirm or cancel a pending large photo delivery session using the sessionId provided.",
      parameters: {
        type: "object",
        properties: {
          sessionId: {
            type: "string",
            description: "The UUID session ID for the pending ZIP confirmation."
          },
          confirmed: {
            type: "boolean",
            description: "True if the user confirms and wants to deliver as a ZIP. False if they reject and want to cancel."
          }
        },
        required: ["sessionId", "confirmed"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getDeliveryHistory",
      description: "Retrieve the user's photo delivery and sharing history records.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "The maximum number of recent delivery records to retrieve. Defaults to 10."
          }
        },
        additionalProperties: false
      }
    }
  }
];
