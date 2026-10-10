# Restaurant Websites: product journeys

> [!CAUTION]
> **Portfolio scope.**
> This showcase explains the restaurant website application and its source-backed design. Illustrations are explanatory, and ordering is a separate design study. Hosted rollout, payment integration, automatic DNS verification, mobile applications, and test execution were not verified in this portfolio review.

## Product intent

Make a restaurant's customer site feel like its own business, while keeping onboarding and content maintenance repeatable across restaurants. The following journeys describe the product structure observed in source.

| Person | Primary task | Design emphasis |
| --- | --- | --- |
| Guest | Browse dishes, prices, availability, and restaurant information. | A readable mobile menu and a clear language choice. |
| Owner | Keep sections, dishes, sizes, photos, hours, and branding current. | Direct controls close to the content being changed. |
| Operator | Create and support restaurant accounts and domains. | An explicit restaurant identity, status, and support context. |

## Product journey storyboard

1. **Bring a restaurant onto the service.** Connect tenant setup to owner access.
2. **Make it recognizably theirs.** Connect brand and theme controls to the guest site.
3. **Keep the menu current.** Bring section management, quick item entry, and availability controls together.
4. **Meet the guest where they are.** Provide English/Arabic presentation and a menu that reads clearly on a phone.

## Design decisions worth explaining

Menu editing, customer browsing, and operator support are different tasks. Give them distinct presentations and make the active restaurant context visible. Explain bilingual layout, integer price storage, and tenant-specific branding as product-engineering decisions.

[Project overview](../README.md) · [Architecture](portfolio-architecture.md)
