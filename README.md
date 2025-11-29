## Small D3 map of US car accidents (2016-2023).

## Data sources
- Accidents CSV from Kaggle: https://www.kaggle.com/datasets/sobhanmoosavi/us-accidents/data
- US state GeoJSON from: https://github.com/jgoodall/us-maps

## How to run
1. Put the Kaggle CSV in `data_raw/` (default name: `US_Accidents_March23.csv`).
2. Run `python3 prepare_data.py` to write `data/us_accidents_state_month.csv`.
3. Start a simple server (e.g., `python3 -m http.server 8000`) and open `index.html`.
