export const SHEET_URL = 'https://script.google.com/macros/s/AKfycbxL4ws0DQr3D6GnoE4ACz6W5zfUUewzQf9ickwcAwNm3M6DTm_97hovDp5PVAPK5ArE/exec';

export const TITLE_SUFFIX = 'Election Center';

export const WIN_NUMBER = 270;
export const TOTAL_EV = 538;

export const GEOMETRY_URL = 'data/geo/geoBoundaries-USA-ADM1_simplified.topojson';
export const COUNTY_GEOMETRY_URL = 'data/geo/counties.topojson';
export const COUNTY_DATA_URL = 'data/counties.json';
export const LOCAL_RESULTS_URL = 'data/results.json';

export const AUTO_REFRESH_MS = 30000;

export const PROJECTION = {
  stateMs: 7600,
  fastMs: 4200,
  fastAfter: 3,
  presidentAutoCloseMs: 0
};

export const EXCLUDED_REGIONS = [
  'American Samoa',
  'Commonwealth of the Northern Mariana Islands',
  'Guam',
  'Puerto Rico',
  'United States Virgin Islands'
];

export const SMALL_STATES = ['VT', 'NH', 'MA', 'RI', 'CT', 'NJ', 'DE', 'MD', 'DC'];

export const ZOOM = {
  min: 1,
  max: 10,
  stateMax: 8,
  padding: 0.82
};

export const COLORS = {
  'Solid GOP': '#d6123a',
  'Likely GOP': '#df4259',
  'Lean GOP': '#e9788a',
  'Tilt GOP': '#f3b1bb',
  'Tilt DEM': '#b0d6f2',
  'Lean DEM': '#76b7e8',
  'Likely DEM': '#3d9ade',
  'Solid DEM': '#2088d8',
  'Tilt IND': '#d9c6f0',
  'Lean IND': '#bc9ee3',
  'Likely IND': '#a47bd4',
  'Solid IND': '#8a4fc8',
  Tossup: '#e2b64a',
  Uncalled: '#8c8c8c',
  Counting: '#8c8c8c',
  'No Results': '#cdcdcd',
  'No Election': '#ececec',
  'No Data': '#ececec'
};
