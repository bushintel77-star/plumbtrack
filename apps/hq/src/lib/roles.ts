/** Organisation roles in the API's ORGANIZATION_ROLES order. Shared by the
 *  setup invite step and the Crews roster so the two surfaces never drift
 *  into separate lists. */
export const ROLE_OPTIONS = [
  { value: "technician", label: "Technician" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "manager", label: "Manager" },
  { value: "accountant", label: "Accountant" },
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Owner" }
] as const
