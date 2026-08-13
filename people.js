export const PEOPLE = [
  { id: "connor", name: "Connor", color: "#4FC3F7" },
  { id: "jack",   name: "Jack",   color: "#FF6E9C" },
  { id: "chad",   name: "Chad",   color: "#5FE3A1" },
  { id: "mike",   name: "Mike",   color: "#FFB454" },
  { id: "brian",  name: "Brian",  color: "#B18CFF" },
  { id: "chris",  name: "Chris",  color: "#FF5F52" },
  { id: "jason",  name: "Jason",  color: "#E8DC5E" },
];

export const byId = Object.fromEntries(PEOPLE.map((p) => [p.id, p]));
