/* Empty by design — the merchant id is on the route, and the requester is
 * read from the request context. Kept as a typed module so the controller
 * can grow the shape later (e.g. partial-scope flags) without breaking
 * existing clients. */
export class CreateExportDto {}
