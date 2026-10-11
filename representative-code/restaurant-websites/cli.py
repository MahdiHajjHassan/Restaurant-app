"""Menu and order workflow without a browser."""
import argparse
import json
from pathlib import Path
from service import Product

parser = argparse.ArgumentParser(description="Restaurant menu and kitchen CLI")
parser.add_argument("--data-dir", type=Path, default=Path(__file__).parent / ".product-data")
sub = parser.add_subparsers(dest="command", required=True)
menu = sub.add_parser("menu")
menu.add_argument("--tenant", default="olive-table")
menu.add_argument("--language", choices=["en","ar"], default="en")
order = sub.add_parser("order")
order.add_argument("--tenant", default="olive-table")
order.add_argument("--table", default="7")
order.add_argument("--item", default="olive-hummus")
order.add_argument("--quantity", type=int, default=2)
kitchen = sub.add_parser("kitchen")
kitchen.add_argument("--tenant", default="olive-table")
kitchen.add_argument("--advance")
args = parser.parse_args()
args.data_dir.mkdir(parents=True, exist_ok=True)
product = Product(args.data_dir)
if args.command == "menu":
    result = product.action("menu", {"tenant_id":args.tenant,"language":args.language})
elif args.command == "order":
    result = product.action("place_order", {"tenant_id":args.tenant,"table":args.table,"items":[{"id":args.item,"quantity":args.quantity}]})
else:
    product.action("set_context", {"role":"owner","tenant_id":args.tenant})
    result = product.action("advance_order", {"order_id":args.advance}) if args.advance else product.state()["orders"]
print(json.dumps(result, ensure_ascii=False, indent=2))
