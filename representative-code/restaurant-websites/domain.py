"""Independent fictional restaurant demo; never runs the original application."""
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import json
from pathlib import Path
import re
import sqlite3
import sys
import unicodedata

SLUG = "restaurant-websites"
PALETTES = {
    "olive": {"accent": "#344f3e", "paper": "#f5f3e9", "art": "#e8ebdc"},
    "terracotta": {"accent": "#813b2e", "paper": "#fff6ee", "art": "#f3e3d3"},
    "midnight": {"accent": "#283c56", "paper": "#eff3f7", "art": "#dee6ef"},
}
CATEGORIES = {
    "starters": ("Small plates", "أطباق صغيرة"),
    "mains": ("From the kitchen", "من المطبخ"),
    "desserts": ("Something sweet", "حلويات"),
    "drinks": ("Sip & stay", "مشروبات"),
}
SEED_TENANTS = [
    ("olive-table", "The Olive Table", "مائدة الزيتون", "A little sun. A generous table.", "قليل من الشمس، ومائدة عامرة.", "olive", "grid", "active", "Garden kitchen · Fictional restaurant", "مطبخ الحديقة · مطعم خيالي"),
    ("ember-yard", "Ember Yard", "ساحة الجمر", "Gather around the good stuff.", "نجتمع حول الطعم الطيب.", "terracotta", "grid", "active", "Fire & friends · Fictional restaurant", "نار وأصدقاء · مطعم خيالي"),
]
# id, category, paired names/descriptions, USD cents, available, original-art key
SEED_ITEMS = {
    "olive-table": [
        ("olive-hummus", "starters", "Silky hummus", "حمص بالطحينة", "Chickpeas, tahini, olive oil and warm flatbread.", "حمص وطحينة وزيت زيتون وخبز دافئ.", 650, True, "hummus"),
        ("olive-fattoush", "starters", "Garden fattoush", "فتوش الحديقة", "Crisp greens, sumac and toasted pita.", "خضار طازجة وسماق وخبز مقرمش.", 800, True, "salad"),
        ("olive-chicken", "mains", "Lemon garden chicken", "دجاج بالليمون", "Herb-roasted chicken, lemon rice and garden greens.", "دجاج بالأعشاب وأرز بالليمون وخضار.", 1450, True, "chicken"),
        ("olive-cauliflower", "mains", "Golden cauliflower", "قرنبيط ذهبي", "Roasted cauliflower, lentils and a silky tahini sauce.", "قرنبيط مشوي وعدس وصلصة الطحينة.", 1200, True, "cauliflower"),
        ("olive-cheesecake", "desserts", "Pistachio cloud", "حلوى الفستق", "A little cheesecake with pistachio and orange blossom.", "تشيز كيك بالفستق وماء الزهر.", 700, True, "cake"),
        ("olive-lemonade", "drinks", "Mint lemonade", "ليموناضة بالنعناع", "Fresh lemon, mint and a slow afternoon.", "ليمون طازج ونعناع ومذاق منعش.", 450, True, "lemonade"),
    ],
    "ember-yard": [
        ("ember-corn", "starters", "Charred street corn", "ذرة مشوية", "Smoky corn, lime and a dusting of paprika.", "ذرة بنكهة مدخنة وليمون وفلفل حلو.", 600, True, "corn"),
        ("ember-salad", "starters", "Crunch bowl", "سلطة مقرمشة", "Cabbage, crisp apple and a bright mustard dressing.", "ملفوف وتفاح وصلصة الخردل.", 750, True, "salad"),
        ("ember-burger", "mains", "The Yard burger", "برغر الساحة", "Grilled patty, cheddar, pickles and our house sauce.", "برغر مشوي وشيدر ومخلل وصلصة خاصة.", 1350, True, "burger"),
        ("ember-flatbread", "mains", "Roasted pepper flatbread", "خبز بالفلفل المشوي", "Fire-roasted peppers, mozzarella and basil.", "فلفل مشوي وموزاريلا وريحان.", 1100, False, "flatbread"),
        ("ember-brownie", "desserts", "Midnight brownie", "براوني الشوكولاتة", "Dark chocolate, sea salt and a soft center.", "شوكولاتة داكنة وملح بحري وقلب طري.", 650, True, "brownie"),
        ("ember-soda", "drinks", "Ginger citrus fizz", "مشروب الزنجبيل", "Ginger, orange and sparkling water.", "زنجبيل وبرتقال ومياه غازية.", 500, True, "lemonade"),
    ],
}


def text_value(value, label, maximum=80):
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > maximum:
        raise ValueError(f"{label} must contain 1–{maximum} characters")
    return value.strip()


def price_cents(value):
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        raise ValueError("Price must be a USD amount between 0 and 1000, with at most two decimals")
    try:
        amount = Decimal(str(value).strip())
        if not amount.is_finite() or amount < 0 or amount > 1000 or amount * 100 != (amount * 100).to_integral_value():
            raise ValueError("Price must be a USD amount between 0 and 1000, with at most two decimals")
        return int(amount * 100)
    except InvalidOperation:
        raise ValueError("Enter a valid USD price") from None


def normalized(value):
    return "".join(c for c in unicodedata.normalize("NFKD", value).casefold() if not unicodedata.combining(c) and c != "ـ")


class Demo:
    def __init__(self, data_dir):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.path = self.data_dir / "restaurant.sqlite3"
        with self.connection() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS tenants (
                    id TEXT PRIMARY KEY, name_en TEXT NOT NULL, name_ar TEXT NOT NULL,
                    tagline_en TEXT NOT NULL, tagline_ar TEXT NOT NULL, palette TEXT NOT NULL,
                    layout TEXT NOT NULL, status TEXT NOT NULL, concept_en TEXT NOT NULL,
                    concept_ar TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'USD', version INTEGER NOT NULL DEFAULT 1
                );
                CREATE TABLE IF NOT EXISTS items (
                    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), category TEXT NOT NULL,
                    name_en TEXT NOT NULL, name_ar TEXT NOT NULL, description_en TEXT NOT NULL,
                    description_ar TEXT NOT NULL, price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
                    available INTEGER NOT NULL, art TEXT NOT NULL, position INTEGER NOT NULL,
                    version INTEGER NOT NULL DEFAULT 1
                );
                CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, time TEXT NOT NULL,
                    actor TEXT NOT NULL, tenant_id TEXT, event TEXT NOT NULL, detail TEXT NOT NULL);
            """)
            if not db.execute("SELECT 1 FROM settings WHERE key='context'").fetchone():
                self.seed(db)

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()  # transaction contexts alone do not close Windows file handles

    def seed(self, db):
        for tenant in SEED_TENANTS:
            db.execute("INSERT INTO tenants (id,name_en,name_ar,tagline_en,tagline_ar,palette,layout,status,concept_en,concept_ar) VALUES (?,?,?,?,?,?,?,?,?,?)", tenant)
            for position, row in enumerate(SEED_ITEMS[tenant[0]]):
                db.execute("INSERT INTO items (id,tenant_id,category,name_en,name_ar,description_en,description_ar,price_cents,available,art,position) VALUES (?,?,?,?,?,?,?,?,?,?,?)", (row[0], tenant[0], *row[1:], position))
        db.execute("INSERT INTO settings VALUES ('context', ?)", (json.dumps({"role": "guest", "tenant_id": None}),))

    def context(self, db):
        return json.loads(db.execute("SELECT value FROM settings WHERE key='context'").fetchone()[0])

    def tenant(self, db, tenant_id):
        if not isinstance(tenant_id, str):
            raise ValueError("Choose a restaurant")
        row = db.execute("SELECT * FROM tenants WHERE id=?", (tenant_id,)).fetchone()
        if not row:
            raise ValueError("Restaurant does not exist")
        return dict(row)

    def owner_tenant(self, db, payload):
        context = self.context(db)
        if context["role"] != "owner":
            raise PermissionError("Only the restaurant's simulated owner can edit its menu and branding")
        if payload.get("tenant_id", context["tenant_id"]) != context["tenant_id"]:
            raise PermissionError("Tenant boundary enforced: this owner cannot write to another restaurant")
        return context["tenant_id"]

    def operator(self, db):
        if self.context(db)["role"] != "operator":
            raise PermissionError("Only the simulated platform operator can onboard restaurants or change status")

    def record(self, db, tenant_id, event, detail):
        actor = self.context(db)["role"]
        db.execute("INSERT INTO audit(time,actor,tenant_id,event,detail) VALUES (?,?,?,?,?)", (datetime.now(timezone.utc).isoformat(timespec="seconds"), actor, tenant_id, event, detail))

    def item_dict(self, row):
        value = dict(row)
        value["available"] = bool(value["available"])
        return value

    def state(self):
        with self.connection() as db:
            context = self.context(db)
            tenants = [dict(row) for row in db.execute("SELECT t.*, (SELECT COUNT(*) FROM items WHERE tenant_id=t.id) AS item_count, (SELECT COUNT(*) FROM items WHERE tenant_id=t.id AND available=1) AS available_count FROM tenants t ORDER BY rowid")]
            owner_items = [self.item_dict(row) for row in db.execute("SELECT * FROM items WHERE tenant_id=? ORDER BY position", (context["tenant_id"],))] if context["role"] == "owner" else []
            audit = [dict(row) for row in db.execute("SELECT * FROM audit ORDER BY id DESC LIMIT 12")]
            return {"context": context, "tenants": tenants, "owner_items": owner_items, "palettes": PALETTES, "categories": [{"id": key, "name_en": value[0], "name_ar": value[1]} for key, value in CATEGORIES.items()], "audit": audit, "boundary": "New local reconstruction · Fictional restaurants · Simulated access contexts"}

    def menu(self, db, payload):
        tenant = self.tenant(db, payload.get("tenant_id", "olive-table"))
        language = payload.get("language", "en")
        if language not in ("en", "ar"):
            raise ValueError("Choose English or Arabic")
        query = payload.get("query", "")
        if not isinstance(query, str) or len(query) > 100:
            raise ValueError("Search must be text of at most 100 characters")
        category = payload.get("category", "all")
        if category not in ("all", *CATEGORIES):
            raise ValueError("Choose a known menu category")
        available_only = payload.get("available_only", False)
        if not isinstance(available_only, bool):
            raise ValueError("Availability filter must be true or false")
        tenant.update(name=tenant["name_" + language], tagline=tenant["tagline_" + language], concept=tenant["concept_" + language], colors=PALETTES[tenant["palette"]])
        servable = tenant["status"] != "suspended"
        rows = [self.item_dict(row) for row in db.execute("SELECT * FROM items WHERE tenant_id=? ORDER BY position", (tenant["id"],))] if servable else []
        categories = [{"id": key, "name": labels[0 if language == "en" else 1], "count": sum(item["category"] == key for item in rows)} for key, labels in CATEGORIES.items() if any(item["category"] == key for item in rows)]
        filtered = []
        for item in rows:
            haystack = " ".join(item[key] for key in ("name_en", "name_ar", "description_en", "description_ar"))
            if category != "all" and item["category"] != category or available_only and not item["available"] or normalized(query.strip()) not in normalized(haystack):
                continue
            item.update(name=item["name_" + language], description=item["description_" + language])
            filtered.append(item)
        return {"restaurant": tenant, "language": language, "direction": "rtl" if language == "ar" else "ltr", "servable": servable, "items": filtered, "categories": categories, "total_items": len(rows), "shown_items": len(filtered)}

    def action(self, name, payload):
        if not isinstance(payload, dict):
            raise ValueError("Send an object")
        with self.connection() as db:
            if name == "menu":
                return self.menu(db, payload)
            if name == "set_context":
                role = payload.get("role")
                if role not in ("guest", "owner", "operator"):
                    raise ValueError("Choose guest, owner or operator")
                tenant_id = self.tenant(db, payload.get("tenant_id"))["id"] if role == "owner" else None
                db.execute("UPDATE settings SET value=? WHERE key='context'", (json.dumps({"role": role, "tenant_id": tenant_id}),))
                return {"message": "Simulated " + role + " context selected", "context": {"role": role, "tenant_id": tenant_id}}
            if name == "update_item":
                tenant_id = self.owner_tenant(db, payload)
                item_id = text_value(payload.get("item_id"), "Dish identifier", 100)
                item = db.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
                if not item:
                    raise ValueError("Dish does not exist")
                if item["tenant_id"] != tenant_id:
                    raise PermissionError("Tenant boundary enforced: this dish belongs to another restaurant")
                if "version" in payload and (isinstance(payload["version"], bool) or payload["version"] != item["version"]):
                    raise RuntimeError("This dish changed since it was loaded. Reload before saving")
                changes = {}
                for field in ("name_en", "name_ar"):
                    if field in payload:
                        changes[field] = text_value(payload[field], "Dish name")
                if "price" in payload:
                    changes["price_cents"] = price_cents(payload["price"])
                if "available" in payload:
                    if not isinstance(payload["available"], bool):
                        raise ValueError("Availability must be true or false")
                    changes["available"] = int(payload["available"])
                if not changes:
                    raise ValueError("Change a name, price or availability")
                fields = ",".join(key + "=?" for key in changes)
                db.execute("UPDATE items SET " + fields + ",version=version+1 WHERE id=? AND tenant_id=?", (*changes.values(), item["id"], tenant_id))
                self.record(db, tenant_id, "Menu saved", changes.get("name_en", item["name_en"]))
                return {"message": "Dish saved; the guest menu reads the stored update", "item_id": item["id"], "version": item["version"] + 1}
            if name == "update_brand":
                tenant_id = self.owner_tenant(db, payload)
                changes = {}
                for field in ("name_en", "name_ar", "tagline_en", "tagline_ar"):
                    if field in payload:
                        changes[field] = text_value(payload[field], "Brand text", 180 if field.startswith("tagline") else 80)
                if "palette" in payload:
                    if not isinstance(payload["palette"], str) or payload["palette"] not in PALETTES:
                        raise ValueError("Choose a curated palette")
                    changes["palette"] = payload["palette"]
                if "layout" in payload:
                    if payload["layout"] not in ("grid", "list"):
                        raise ValueError("Choose grid or list layout")
                    changes["layout"] = payload["layout"]
                if not changes:
                    raise ValueError("Change a brand setting")
                fields = ",".join(key + "=?" for key in changes)
                db.execute("UPDATE tenants SET " + fields + ",version=version+1 WHERE id=?", (*changes.values(), tenant_id))
                self.record(db, tenant_id, "Brand saved", ", ".join(changes))
                return {"message": "Brand saved; the live guest preview now uses these settings"}
            if name == "onboard":
                self.operator(db)
                slug = text_value(payload.get("slug"), "Restaurant slug", 48).lower()
                if not re.fullmatch(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*", slug):
                    raise ValueError("Slug must use lowercase words, numbers and single hyphens")
                name_en = text_value(payload.get("name_en"), "English restaurant name")
                name_ar = text_value(payload.get("name_ar"), "Arabic restaurant name")
                palette = payload.get("palette", "olive")
                if not isinstance(palette, str) or palette not in PALETTES:
                    raise ValueError("Choose a curated palette")
                if db.execute("SELECT 1 FROM tenants WHERE id=?", (slug,)).fetchone():
                    raise RuntimeError("That restaurant slug already exists")
                if db.execute("SELECT COUNT(*) FROM tenants").fetchone()[0] >= 20:
                    raise ValueError("This demo supports up to 20 fictional restaurants. Reset to start again")
                db.execute("INSERT INTO tenants (id,name_en,name_ar,tagline_en,tagline_ar,palette,layout,status,concept_en,concept_ar) VALUES (?,?,?,?,?,?,'grid','trial',?,?)", (slug, name_en, name_ar, "Fresh starts, familiar flavors.", "بداية جديدة ونكهات مألوفة.", palette, "Neighborhood cafe · Fictional restaurant", "مقهى الحي · مطعم خيالي"))
                defaults = [
                    ("soup", "starters", "Seasonal soup", "شوربة الموسم", "A warm bowl with garden herbs.", "شوربة دافئة مع أعشاب طازجة.", 650, "hummus"),
                    ("sandwich", "mains", "Garden sandwich", "ساندويتش الخضار", "Roasted vegetables, fresh bread and lemon dressing.", "خضار مشوية وخبز طازج وصلصة الليمون.", 950, "flatbread"),
                    ("cake", "desserts", "Orange cake", "كيك البرتقال", "A simple slice to finish the afternoon.", "قطعة كيك لذيذة لنهاية اليوم.", 550, "cake"),
                ]
                for position, row in enumerate(defaults):
                    db.execute("INSERT INTO items (id,tenant_id,category,name_en,name_ar,description_en,description_ar,price_cents,available,art,position) VALUES (?,?,?,?,?,?,?,?,1,?,?)", (slug + "-" + row[0], slug, *row[1:], position))
                self.record(db, slug, "Restaurant onboarded", name_en + " · trial · 3 sample dishes")
                return {"message": "Fictional restaurant created in trial status with 3 starter dishes", "tenant_id": slug}
            if name == "set_status":
                self.operator(db)
                tenant = self.tenant(db, payload.get("tenant_id"))
                status = payload.get("status")
                if status not in ("trial", "active", "suspended"):
                    raise ValueError("Choose trial, active or suspended")
                db.execute("UPDATE tenants SET status=?,version=version+1 WHERE id=?", (status, tenant["id"]))
                self.record(db, tenant["id"], "Status changed", tenant["status"] + " → " + status)
                return {"message": "Restaurant status changed to " + status}
            if name == "reset":
                for table in ("audit", "items", "tenants", "settings"):
                    db.execute("DELETE FROM " + table)
                self.seed(db)
                return {"message": "Restaurant demo reset to its two fictional brands"}
            raise ValueError("Unknown restaurant demo action")


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts"))
    from demo_runtime import serve_project
    serve_project(SLUG)
