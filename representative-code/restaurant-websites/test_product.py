import tempfile
import unittest
from pathlib import Path
from service import Product

class OrderWorkflow(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = Product(Path(self.temp.name))
    def tearDown(self):
        self.temp.cleanup()
    def test_order_uses_stored_price_and_rejects_cross_tenant(self):
        result = self.app.action('place_order', {'tenant_id':'olive-table','table':'7','items':[{'id':'olive-hummus','quantity':2}], 'total_cents':1})
        self.assertEqual(result['order']['total_cents'], 1300)
        with self.assertRaises(PermissionError):
            self.app.action('place_order', {'tenant_id':'olive-table','table':'7','items':[{'id':'ember-burger','quantity':1}]})
    def test_kitchen_is_tenant_scoped_and_persists(self):
        order = self.app.action('place_order', {'tenant_id':'olive-table','table':'8','items':[{'id':'olive-chicken','quantity':1}]})['order']
        self.app.action('set_context', {'role':'owner','tenant_id':'ember-yard'})
        with self.assertRaises(PermissionError):
            self.app.action('advance_order', {'order_id':order['id']})
        self.app.action('set_context', {'role':'owner','tenant_id':'olive-table'})
        self.app.action('advance_order', {'order_id':order['id']})
        fresh = Product(Path(self.temp.name))
        saved = next(o for o in fresh.state()['orders'] if o['id'] == order['id'])
        self.assertEqual(saved['status'], 'preparing')
    def test_unavailable_dish_cannot_be_ordered(self):
        with self.assertRaises(ValueError):
            self.app.action('place_order', {'tenant_id':'ember-yard','table':'2','items':[{'id':'ember-flatbread','quantity':1}]})
    def test_suspended_restaurant_cannot_receive_order(self):
        self.app.action('set_context', {'role':'operator'})
        self.app.action('set_status', {'tenant_id':'olive-table','status':'suspended'})
        with self.assertRaises(ValueError):
            self.app.action('place_order', {'tenant_id':'olive-table','table':'2','items':[{'id':'olive-hummus','quantity':1}]})

if __name__ == '__main__':
    unittest.main()
