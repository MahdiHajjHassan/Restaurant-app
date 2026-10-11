"""Restaurant product: bilingual menus, tenant ownership and a persisted order queue."""
from datetime import datetime, timezone
import json
from pathlib import Path
import uuid
from domain import Demo, text_value

STATES = ("received", "preparing", "ready", "served")

class Product(Demo):
    def __init__(self, data_dir):
        super().__init__(data_dir)
        with self.connection() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS orders (
                    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
                    table_name TEXT NOT NULL, customer TEXT NOT NULL, note TEXT NOT NULL,
                    items TEXT NOT NULL, total_cents INTEGER NOT NULL,
                    status TEXT NOT NULL, created_at TEXT NOT NULL
                );
            """)
            if not db.execute("SELECT 1 FROM orders").fetchone() and not db.execute("SELECT 1 FROM settings WHERE key='orders_seeded'").fetchone():
                self.place(db, {"tenant_id":"olive-table","table":"04","customer":"Table 04","items":[{"id":"olive-hummus","quantity":2},{"id":"olive-chicken","quantity":1}]})
                self.place(db, {"tenant_id":"olive-table","table":"11","customer":"Table 11","items":[{"id":"olive-fattoush","quantity":1},{"id":"olive-lemonade","quantity":2}]})
                db.execute("INSERT INTO settings VALUES ('orders_seeded','yes')")

    def place(self, db, payload):
        tenant = self.tenant(db, payload.get("tenant_id"))
        if tenant["status"] == "suspended":
            raise ValueError("This restaurant is not taking orders.")
        table = text_value(payload.get("table"), "Table", 30)
        customer = text_value(payload.get("customer", "Guest"), "Guest name", 80)
        note = payload.get("note", "")
        if not isinstance(note, str) or len(note) > 500:
            raise ValueError("Order notes must be at most 500 characters.")
        lines = payload.get("items")
        if not isinstance(lines, list) or not 1 <= len(lines) <= 30:
            raise ValueError("Add at least one menu item.")
        items, total = [], 0
        for line in lines:
            if not isinstance(line, dict):
                raise ValueError("Invalid order item.")
            row = db.execute("SELECT * FROM items WHERE id=?", (line.get("id"),)).fetchone()
            if not row or row["tenant_id"] != tenant["id"]:
                raise PermissionError("Every ordered item must belong to this restaurant.")
            if not row["available"]:
                raise ValueError(row["name_en"] + " is sold out.")
            qty = line.get("quantity", 1)
            if isinstance(qty, bool) or not isinstance(qty, int) or not 1 <= qty <= 20:
                raise ValueError("Quantity must be from 1 to 20.")
            items.append({"id":row["id"],"name":row["name_en"],"quantity":qty,"price_cents":row["price_cents"]})
            total += row["price_cents"] * qty
        identifier = "ORD-" + uuid.uuid4().hex[:6].upper()
        timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
        db.execute("INSERT INTO orders VALUES (?,?,?,?,?,?,?,'received',?)",
                   (identifier, tenant["id"], table, customer, note, json.dumps(items), total, timestamp))
        return self.order_dict(db.execute("SELECT * FROM orders WHERE id=?", (identifier,)).fetchone())

    @staticmethod
    def order_dict(row):
        value = dict(row)
        value["items"] = json.loads(value["items"])
        return value

    def state(self):
        value = super().state()
        with self.connection() as db:
            context = self.context(db)
            value["orders"] = [self.order_dict(row) for row in db.execute("SELECT * FROM orders WHERE tenant_id=? ORDER BY created_at DESC,id DESC", (context["tenant_id"],))] if context["role"] == "owner" else []
        value.pop("boundary", None)
        value["order_states"] = list(STATES)
        return value

    def action(self, name, payload):
        if name == "place_order":
            with self.connection() as db:
                order = self.place(db, payload)
            return {"message":"Your order is with the kitchen.", "order":order}
        if name == "advance_order":
            with self.connection() as db:
                tenant_id = self.owner_tenant(db, payload)
                row = db.execute("SELECT * FROM orders WHERE id=?", (payload.get("order_id"),)).fetchone()
                if not row or row["tenant_id"] != tenant_id:
                    raise PermissionError("This order belongs to another restaurant.")
                stage = STATES.index(row["status"])
                if stage == len(STATES) - 1:
                    raise ValueError("This order is already served.")
                db.execute("UPDATE orders SET status=? WHERE id=?", (STATES[stage+1], row["id"]))
                self.record(db, tenant_id, "Kitchen status", row["id"] + " " + STATES[stage+1])
                return {"message":"Order marked " + STATES[stage+1], "order_id":row["id"]}
        if name == "reset":
            with self.connection() as db:
                db.execute("DELETE FROM orders")
                db.execute("DELETE FROM settings WHERE key='orders_seeded'")
            result = super().action(name, payload)
            self.__init__(self.path.parent)
            return result
        return super().action(name, payload)
