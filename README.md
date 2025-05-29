# UPTST (Ultimate Prayer Times Statistics Tool)

A web-based tool for analyzing and visualizing prayer times data across different locations and calculation methods.

## Features

- Calculate prayer times for any location worldwide
- Support for both Gregorian and Hijri calendar years
- Multiple calculation methods (ISNA, Muslim World League, etc.)
- Interactive visualization of prayer times throughout the year
- Detailed statistics for prayer times, intervals, and fasting durations
- Address search with autocomplete using OpenStreetMap Nominatim
- GPS location support
- Export statistics to JSON

## Getting Started

1. Clone the repository:
```bash
git clone https://github.com/yourusername/UPTST.git
cd UPTST
```

2. Open `index.html` in your web browser

## Usage

1. Enter a location by:
   - Typing an address (with autocomplete)
   - Entering coordinates manually
   - Using the GPS button to get your current location

2. Select the year type (Gregorian or Hijri) and enter the year

3. Choose a calculation method

4. Click "Calculate" to generate prayer times and statistics

5. View the interactive chart and statistics tables

6. Optionally download the statistics as JSON

## API Integration

This tool uses the following APIs:
- Aladhan API for prayer times calculation
- OpenStreetMap Nominatim for geocoding

## License

MIT License - see LICENSE file for details
