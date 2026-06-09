/**
 * Mock execution for searchPhotos tool.
 */
export async function execute(args) {
  return [
    {
      id: "photo_001",
      person: "Dad",
      date: "2024-03-11",
      url: "mock://photo1"
    }
  ];
}
