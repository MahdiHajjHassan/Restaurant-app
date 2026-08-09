/**
 * The console's kit of parts.
 *
 * Presentational only, like the rest of `src/ui/`: nothing here reads the
 * database, and nothing in `core/` may import it.
 */
export { Button, type ButtonVariant } from "./button";
export { Panel, type Spine } from "./panel";
export { Field, inputClassName } from "./field";
export { StatusBadge, spineFor, type TenantStatus } from "./status-badge";
export { PageHeader } from "./page-header";
export { EmptyState } from "./empty-state";
