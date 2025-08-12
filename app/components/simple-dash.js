"use client";

import React, { useState, useEffect } from 'react';
import _ from 'lodash';
import { ChevronUp, ChevronDown, Sun, Moon, Plus, Minus, RefreshCw } from 'lucide-react';

const SimplePriceLabsPage = () => {
    const [groupedData, setGroupedData] = useState(null);
    const [normalizedListings, setNormalizedListings] = useState([]);
    const [sortedData, setSortedData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [darkMode, setDarkMode] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState(new Set());
    const [refreshing, setRefreshing] = useState(false);
    const [lastRefresh, setLastRefresh] = useState(null);
    const [cooldownRemaining, setCooldownRemaining] = useState(0);
    
    // Sorting state
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

    // Function to flatten nested objects (equivalent to pandas json_normalize)
    const flattenObject = (obj, prefix = '') => {
      const flattened = {};
      
      for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
          const newKey = prefix ? `${prefix}.${key}` : key;
          
          if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            Object.assign(flattened, flattenObject(obj[key], newKey));
          } else {
            flattened[newKey] = obj[key];
          }
        }
      }
      
      return flattened;
    };

    // Function to normalize listings (like json_normalize)
    const normalizeListings = (listings) => {
      return listings.map(listing => flattenObject(listing));
    };

    // Function to group by 'group' and calculate means (like pandas groupby)
    const groupAndCalculateMeans = (normalizedData) => {
      const mpiColumns = ['mpi_next_7', 'mpi_next_30', 'mpi_next_60', 'mpi_next_90', 'mpi_next_120'];
      
      // Group by 'group' field using lodash
      const grouped = _.groupBy(normalizedData, 'group');
      
      const result = {};
      
      for (let group in grouped) {
        const listings = grouped[group];
        result[group] = {};
        
        // Calculate mean for each MPI column
        mpiColumns.forEach(column => {
          const values = listings
            .map(listing => listing[column])
            .filter(val => val !== null && val !== undefined && !isNaN(val))
            .map(val => parseFloat(val));
          
          if (values.length > 0) {
            result[group][column] = (values.reduce((sum, val) => sum + val, 0) / values.length) * 100;
          } else {
            result[group][column] = null;
          }
        });
        
        // Add count for reference
        result[group].count = listings.length;
      }
      
      return result;
    };

    // Apply sorting to data
    const applySorting = (data) => {
      if (!data || !sortConfig.key) return data;
      
      const entries = Object.entries(data);
      const sorted = entries.sort(([groupA, valuesA], [groupB, valuesB]) => {
        let aValue, bValue;
        
        if (sortConfig.key === 'group') {
          aValue = groupA;
          bValue = groupB;
        } else {
          aValue = valuesA[sortConfig.key];
          bValue = valuesB[sortConfig.key];
          
          // Handle null values (put them at the end)
          if (aValue === null && bValue === null) return 0;
          if (aValue === null) return 1;
          if (bValue === null) return -1;
        }
        
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
      
      return Object.fromEntries(sorted);
    };

    // Handle sorting
    const handleSort = (key) => {
      let direction = 'asc';
      if (sortConfig.key === key && sortConfig.direction === 'asc') {
        direction = 'desc';
      }
      setSortConfig({ key, direction });
    };

    // Handle refreshing data
    const handleRefresh = async () => {
      if (cooldownRemaining > 0) return;
      
      setRefreshing(true);
      setError(null);
      
      try {
        console.log('Refreshing data from API route...');
        
        const response = await fetch('/api/pricelabs/listings');
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const responseData = await response.json();
        console.log('Refreshed API response:', responseData);
        
        if (!responseData.listings || !Array.isArray(responseData.listings)) {
          throw new Error('Invalid response format: missing or invalid "listings" array');
        }
        
        // Process the refreshed data
        const normalizedListings = normalizeListings(responseData.listings);
        const validListings = normalizedListings.filter(listing => listing.group !== null && listing.group !== undefined);
        const grouped = groupAndCalculateMeans(validListings);
        
        setNormalizedListings(validListings);
        setGroupedData(grouped);
        setLastRefresh(Date.now());
        setCooldownRemaining(120); // 2 minutes in seconds
        
      } catch (err) {
        console.error('Error refreshing data:', err);
        setError(err.message);
      } finally {
        setRefreshing(false);
      }
    };

    // Cooldown timer effect
    useEffect(() => {
      let interval;
      if (cooldownRemaining > 0) {
        interval = setInterval(() => {
          setCooldownRemaining(prev => {
            if (prev <= 1) {
              clearInterval(interval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
      
      return () => {
        if (interval) clearInterval(interval);
      };
    }, [cooldownRemaining]);

    // Handle expanding/collapsing groups
    const toggleGroup = (groupName) => {
      const newExpanded = new Set(expandedGroups);
      if (newExpanded.has(groupName)) {
        newExpanded.delete(groupName);
      } else {
        newExpanded.add(groupName);
      }
      setExpandedGroups(newExpanded);
    };

    // Get listings for a specific group
    const getListingsForGroup = (groupName) => {
      return normalizedListings.filter(listing => listing.group === groupName);
    };

    // Update sorted data when sorting changes
    useEffect(() => {
      if (groupedData) {
        const sorted = applySorting(groupedData);
        setSortedData(sorted);
      }
    }, [groupedData, sortConfig]);

    // Fetch data once on component mount
    useEffect(() => {
      const fetchData = async () => {
        try {
          console.log('Fetching data from API route...');
          
          const response = await fetch('/api/pricelabs/listings');
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const responseData = await response.json();
          console.log('Raw API response:', responseData);
          
          if (!responseData.listings || !Array.isArray(responseData.listings)) {
            throw new Error('Invalid response format: missing or invalid "listings" array');
          }
          
          // Step 1: Normalize nested structure (equivalent to json_normalize)
          const normalizedListings = normalizeListings(responseData.listings);
          console.log('Normalized listings count (before filtering):', normalizedListings.length);
          
          // Filter out listings where group is null
          const validListings = normalizedListings.filter(listing => listing.group !== null && listing.group !== undefined);
          console.log('Valid listings count (after filtering out null groups):', validListings.length);
          
          // Step 2: Group by 'group' and calculate means (equivalent to groupby().mean())
          const grouped = groupAndCalculateMeans(validListings);
          console.log('Grouped results:', grouped);
          
          setNormalizedListings(validListings);
          setGroupedData(grouped);
          
        } catch (err) {
          console.error('Error fetching data:', err);
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }, []); // Empty dependency array - runs once on mount

    if (loading) {
      return (
        <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>Loading PriceLabs data...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
          <div className={`text-center p-6 rounded-lg max-w-md border ${
            darkMode 
              ? 'bg-red-900 border-red-700 text-red-200' 
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <h2 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-red-200' : 'text-red-800'}`}>Error</h2>
            <p>{error}</p>
          </div>
        </div>
      );
    }

    if (!groupedData || Object.keys(groupedData).length === 0) {
      return (
        <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
          <div className={`text-center p-6 rounded-lg max-w-md border ${
            darkMode 
              ? 'bg-yellow-900 border-yellow-700 text-yellow-200' 
              : 'bg-yellow-50 border-yellow-200 text-yellow-700'
          }`}>
            <h2 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-yellow-200' : 'text-yellow-800'}`}>No Data</h2>
            <p>No grouped data available</p>
          </div>
        </div>
      );
    }

    const SortIcon = ({ column }) => {
      if (sortConfig.key !== column) return <ChevronUp className="h-4 w-4 text-gray-300" />;
      return sortConfig.direction === 'asc' 
        ? <ChevronUp className="h-4 w-4 text-blue-600" />
        : <ChevronDown className="h-4 w-4 text-blue-600" />;
    };

    const displayData = sortedData || groupedData;

    return (
      <div className={`min-h-screen py-8 transition-colors duration-200 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="max-w-7xl mx-auto px-4 relative">
          {/* Dark Mode Toggle */}
          <div className="absolute top-0 right-4">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-lg transition-colors ${
                darkMode 
                  ? 'bg-gray-800 text-yellow-400 hover:bg-gray-700' 
                  : 'bg-white text-gray-600 hover:bg-gray-100 shadow-sm border border-gray-200'
              }`}
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>

          <h1 className={`text-3xl font-bold mb-8 text-center ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            PriceLabs MPI Analysis by Group
          </h1>
          
          {/* Summary Stats */}
          <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`p-6 rounded-lg shadow ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <h3 className={`text-lg font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Total Groups</h3>
              <p className="text-3xl font-bold text-blue-600">
                {Object.keys(displayData).length}
              </p>
            </div>
            <div className={`p-6 rounded-lg shadow ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <h3 className={`text-lg font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Total Listings</h3>
              <p className="text-3xl font-bold text-green-600">
                {Object.values(displayData).reduce((sum, group) => sum + group.count, 0)}
              </p>
            </div>
            <div className={`p-6 rounded-lg shadow ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <h3 className={`text-lg font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Avg Listings/Group</h3>
              <p className="text-3xl font-bold text-purple-600">
                {Object.keys(displayData).length > 0
                  ? Math.round(Object.values(displayData).reduce((sum, group) => sum + group.count, 0) / Object.keys(displayData).length)
                  : 0
                }
              </p>
            </div>
          </div>

          {/* Main Results Table */}
          <div className={`rounded-lg shadow overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className={`px-6 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className={`text-xl font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                    Average MPI by Group
                  </h2>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Market Price Index averages for 7, 30, 60, 90, and 120 day periods. Click column headers to sort.
                  </p>
                  {cooldownRemaining > 0 && (
                    <p className={`text-xs mt-2 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                      Next refresh available in {Math.floor(cooldownRemaining / 60)}:{(cooldownRemaining % 60).toString().padStart(2, '0')}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleRefresh}
                  disabled={refreshing || cooldownRemaining > 0}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                    refreshing || cooldownRemaining > 0
                      ? darkMode 
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : darkMode
                        ? 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800' 
                        : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
                  }`}
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
                  <tr>
                    <th 
                      onClick={() => handleSort('group')}
                      className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer select-none transition-colors ${
                        darkMode 
                          ? 'text-gray-300 hover:bg-gray-600' 
                          : 'text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Group</span>
                        <SortIcon column="group" />
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('count')}
                      className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer select-none transition-colors ${
                        darkMode 
                          ? 'text-gray-300 hover:bg-gray-600' 
                          : 'text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Listings Count</span>
                        <SortIcon column="count" />
                      </div>
                    </th>
                    {['mpi_next_7', 'mpi_next_30', 'mpi_next_60', 'mpi_next_90', 'mpi_next_120'].map(column => (
                      <th 
                        key={column}
                        onClick={() => handleSort(column)}
                        className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer select-none transition-colors ${
                          darkMode 
                            ? 'text-gray-300 hover:bg-gray-600' 
                            : 'text-gray-500 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-center space-x-1">
                          <span>{column.replace('mpi_next_', 'MPI Next ')}</span>
                          <SortIcon column={column} />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={`divide-y ${darkMode ? 'bg-gray-800 divide-gray-700' : 'bg-white divide-gray-200'}`}>
                  {Object.entries(displayData).map(([group, values]) => {
                    const groupListings = getListingsForGroup(group);
                    const isExpanded = expandedGroups.has(group);
                    
                    return (
                      <React.Fragment key={group}>
                        {/* Group Row */}
                        <tr className={`transition-colors ${
                          darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                        }`}>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => toggleGroup(group)}
                                className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors ${
                                  darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-500 hover:text-gray-700'
                                }`}
                              >
                                {isExpanded ? (
                                  <Minus className="h-4 w-4" />
                                ) : (
                                  <Plus className="h-4 w-4" />
                                )}
                              </button>
                              <span>{group}</span>
                            </div>
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {values.count}
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {values.mpi_next_7 !== null ? values.mpi_next_7.toFixed(1): 'N/A'}
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {values.mpi_next_30 !== null ? values.mpi_next_30.toFixed(1): 'N/A'}
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {values.mpi_next_60 !== null ? values.mpi_next_60.toFixed(1): 'N/A'}
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {values.mpi_next_90 !== null ? values.mpi_next_90.toFixed(1): 'N/A'}
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {values.mpi_next_120 !== null ? values.mpi_next_120.toFixed(1): 'N/A'}
                          </td>
                        </tr>
                        
                        {/* Expanded Individual Listings */}
                        {isExpanded && groupListings.map((listing, index) => (
                          <tr 
                            key={`${group}-listing-${index}`} 
                            className={`${darkMode ? 'bg-gray-750' : 'bg-gray-25'} border-l-4 border-blue-200`}
                          >
                            <td className={`px-12 py-3 whitespace-nowrap text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              {listing.id || `Listing ${index + 1}`}
                            </td>
                            <td className={`px-6 py-3 whitespace-nowrap text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              1
                            </td>
                            <td className={`px-6 py-3 whitespace-nowrap text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              {listing.mpi_next_7 !== null && listing.mpi_next_7 !== undefined ? (parseFloat(listing.mpi_next_7) * 100).toFixed(1): 'N/A'}
                            </td>
                            <td className={`px-6 py-3 whitespace-nowrap text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              {listing.mpi_next_30 !== null && listing.mpi_next_30 !== undefined ? (parseFloat(listing.mpi_next_30) * 100).toFixed(1): 'N/A'}
                            </td>
                            <td className={`px-6 py-3 whitespace-nowrap text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              {listing.mpi_next_60 !== null && listing.mpi_next_60 !== undefined ? (parseFloat(listing.mpi_next_60) * 100).toFixed(1): 'N/A'}
                            </td>
                            <td className={`px-6 py-3 whitespace-nowrap text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              {listing.mpi_next_90 !== null && listing.mpi_next_90 !== undefined ? (parseFloat(listing.mpi_next_90) * 100).toFixed(1): 'N/A'}
                            </td>
                            <td className={`px-6 py-3 whitespace-nowrap text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              {listing.mpi_next_120 !== null && listing.mpi_next_120 !== undefined ? (parseFloat(listing.mpi_next_120) * 100).toFixed(1): 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className={`mt-8 text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <p>Data fetched from PriceLabs API</p>
          </div>
        </div>
      </div>
    );
};

export default SimplePriceLabsPage;