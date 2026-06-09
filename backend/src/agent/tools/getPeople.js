import Person from "../../models/Person.js";

/**
 * Live database execution for getPeople tool.
 */
export async function execute(args, userId) {
  if (!userId) {
    return [];
  }
  const people = await Person.find({ userId }).select("name").lean();
  return people.map((p) => p.name);
}
