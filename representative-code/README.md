# Representative source

> [!CAUTION]
> This is a representative implementation of the workflows and engineering ideas I worked on, not the original project source. Private or confidential implementations are not included. The examples use fictional data.

## Run locally

```sh
cd restaurant-websites
npm ci
npm run build
python serve.py
```

The server prints its local address. Python 3.12+ and Node.js 22.12+ are required.

## Inspect and check

```sh
python cli.py --help
python -m unittest discover -s . -p "test*.py" -v
```

The [restaurant-websites/](restaurant-websites/) folder contains the implementation, fictional fixtures, tests and locked build configuration.
