# Restaurant Websites: architecture and extension points

> [!CAUTION]
> **Portfolio scope.**
> This showcase explains the restaurant website application and its source-backed design. Illustrations are explanatory, and ordering is a separate design study. Hosted rollout, payment integration, automatic DNS verification, mobile applications, and test execution were not verified in this portfolio review.

## Current implementation structure

The application separates public restaurant identity, owner access, platform operations, tenant-scoped data, and media processing.

| Boundary | Responsibility | Why it matters |
| --- | --- | --- |
| Public domain resolution | Match a verified hostname to a restaurant. | A visitor reaches the correct restaurant identity. |
| Guest presentation | Render theme, bilingual menu content, contacts, and opening hours. | Restaurant content remains distinct from operator tools. |
| Owner access | Authenticate the session and check restaurant membership for writes. | Being signed in alone is insufficient to administer another restaurant. |
| Operator access | Provision tenants, manage status/domains, and explicitly enter support access. | Platform operations have their own authority and UI. |
| Application core | Keep menu, theme, contact, identity, and data logic in focused modules. | Product logic has clear boundaries beneath the route/UI layer. |
| Data layer | Tenant-scoped transactions and PostgreSQL row-level security for tenant content. | Isolation is addressed in both application access and database policies. |
| Media | Validate and process uploads before storing encoded images. | Photo handling has a dedicated boundary rather than arbitrary file writes. |

Domain and membership records participate in resolving a tenant before a tenant-scoped transaction exists. Their authorization must therefore be explicit; their access controls are evaluated before tenant-scoped content policies.

## Owner update journey

```mermaid
sequenceDiagram
  participant Owner as Restaurant owner
  participant Action as Authorized server action
  participant Core as Tenant-scoped repository
  participant DB as PostgreSQL
  participant Site as Guest site
  Owner->>Action: Submit a menu change
  Action->>Action: Validate session, membership and input
  Action->>Core: Write within restaurant context
  Core->>DB: Scoped transaction
  DB-->>Core: Stored result
  Core-->>Action: Result
  Action-->>Owner: Save result
  Site->>Core: Read restaurant content
  Core-->>Site: Menu and presentation data
```

## Ordering design study

The ordering design connects menu browsing to a cart, order lifecycle, restaurant queue, and guest updates.

```mermaid
flowchart TB
  Browse["Existing guest menu"] -. "design study" .-> Cart["Cart and checkout design"]
  Cart -.-> Order["Order lifecycle design"]
  Order -.-> Queue["Restaurant order queue design"]
  Queue -.-> Fulfil["Pickup / delivery coordination design"]
  Order -.-> Payment["Later payment integration"]
  Order -.-> Updates["Guest status update design"]
```

The design study specifies snapshotted order prices, explicit order states, retry handling, and order-level access rules. These contracts sit alongside the menu and tenant boundaries.

[Project overview](../README.md) · [Product design](portfolio-product-design.md)
