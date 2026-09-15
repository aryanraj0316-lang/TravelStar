import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

interface StarDef {
  top: string;
  left: string;
  size: number;
  opacity: number;
  group: number;
}

// Crowded field of 260 ultra-fine micro pinpoint star dots
const STARS: StarDef[] = [
  { top: '23.5%', left: '44.5%', size: 1.0, opacity: 0.64, group: 0 },
  { top: '53.1%', left: '5.4%', size: 1.1, opacity: 0.57, group: 1 },
  { top: '38.9%', left: '29.4%', size: 1.7, opacity: 0.95, group: 2 },
  { top: '86.8%', left: '11.5%', size: 1.2, opacity: 0.83, group: 3 },
  { top: '56.9%', left: '29.2%', size: 1.1, opacity: 0.58, group: 4 },
  { top: '21.6%', left: '49.9%', size: 1.4, opacity: 0.76, group: 5 },
  { top: '4.8%', left: '60.3%', size: 0.8, opacity: 0.54, group: 0 },
  { top: '65.0%', left: '85.3%', size: 1.2, opacity: 0.75, group: 1 },
  { top: '17.6%', left: '43.9%', size: 1.1, opacity: 0.48, group: 2 },
  { top: '37.7%', left: '79.8%', size: 0.8, opacity: 0.54, group: 3 },
  { top: '86.6%', left: '91.3%', size: 0.8, opacity: 0.7, group: 4 },
  { top: '13.4%', left: '82.0%', size: 1.0, opacity: 0.56, group: 5 },
  { top: '26.9%', left: '27.3%', size: 1.1, opacity: 0.39, group: 0 },
  { top: '88.3%', left: '49.5%', size: 1.1, opacity: 0.52, group: 1 },
  { top: '40.5%', left: '40.0%', size: 1.1, opacity: 0.57, group: 2 },
  { top: '54.3%', left: '66.7%', size: 1.2, opacity: 0.77, group: 3 },
  { top: '6.6%', left: '80.8%', size: 1.1, opacity: 0.64, group: 4 },
  { top: '50.5%', left: '43.4%', size: 1.5, opacity: 0.79, group: 5 },
  { top: '67.2%', left: '89.0%', size: 1.7, opacity: 0.98, group: 0 },
  { top: '48.4%', left: '51.3%', size: 0.8, opacity: 0.46, group: 1 },
  { top: '89.9%', left: '27.2%', size: 1.1, opacity: 0.56, group: 2 },
  { top: '56.1%', left: '9.9%', size: 1.7, opacity: 0.9, group: 3 },
  { top: '38.6%', left: '65.9%', size: 1.5, opacity: 0.64, group: 4 },
  { top: '84.8%', left: '59.7%', size: 1.1, opacity: 0.5, group: 5 },
  { top: '66.8%', left: '77.6%', size: 0.8, opacity: 0.67, group: 0 },
  { top: '15.1%', left: '17.4%', size: 1.0, opacity: 0.62, group: 1 },
  { top: '66.4%', left: '7.4%', size: 1.9, opacity: 0.92, group: 2 },
  { top: '7.6%', left: '7.3%', size: 1.1, opacity: 0.36, group: 3 },
  { top: '60.5%', left: '8.2%', size: 1.1, opacity: 0.41, group: 4 },
  { top: '55.7%', left: '90.9%', size: 1.0, opacity: 0.52, group: 5 },
  { top: '86.9%', left: '54.3%', size: 0.8, opacity: 0.65, group: 0 },
  { top: '75.1%', left: '85.1%', size: 1.1, opacity: 0.49, group: 1 },
  { top: '65.5%', left: '22.4%', size: 1.4, opacity: 0.78, group: 2 },
  { top: '25.7%', left: '38.9%', size: 0.8, opacity: 0.36, group: 3 },
  { top: '24.9%', left: '52.7%', size: 1.0, opacity: 0.53, group: 4 },
  { top: '8.0%', left: '47.7%', size: 1.0, opacity: 0.42, group: 5 },
  { top: '41.1%', left: '81.9%', size: 1.5, opacity: 0.72, group: 0 },
  { top: '74.6%', left: '51.1%', size: 1.0, opacity: 0.45, group: 1 },
  { top: '69.4%', left: '39.5%', size: 1.0, opacity: 0.41, group: 2 },
  { top: '77.8%', left: '79.6%', size: 1.0, opacity: 0.48, group: 3 },
  { top: '19.1%', left: '44.6%', size: 1.5, opacity: 0.83, group: 4 },
  { top: '12.9%', left: '79.1%', size: 0.8, opacity: 0.56, group: 5 },
  { top: '51.6%', left: '14.8%', size: 2.1, opacity: 0.97, group: 0 },
  { top: '79.5%', left: '62.3%', size: 1.1, opacity: 0.67, group: 1 },
  { top: '2.5%', left: '75.1%', size: 1.4, opacity: 0.64, group: 2 },
  { top: '23.6%', left: '8.1%', size: 1.4, opacity: 0.74, group: 3 },
  { top: '65.1%', left: '76.0%', size: 1.1, opacity: 0.38, group: 4 },
  { top: '71.8%', left: '90.4%', size: 1.0, opacity: 0.59, group: 5 },
  { top: '10.1%', left: '65.6%', size: 1.7, opacity: 0.92, group: 0 },
  { top: '41.8%', left: '62.5%', size: 1.0, opacity: 0.66, group: 1 },
  { top: '94.5%', left: '12.6%', size: 1.2, opacity: 0.69, group: 2 },
  { top: '37.6%', left: '30.4%', size: 1.9, opacity: 0.98, group: 3 },
  { top: '65.1%', left: '15.2%', size: 1.2, opacity: 0.64, group: 4 },
  { top: '15.8%', left: '56.0%', size: 1.0, opacity: 0.65, group: 5 },
  { top: '84.5%', left: '10.1%', size: 0.8, opacity: 0.67, group: 0 },
  { top: '97.4%', left: '61.9%', size: 1.1, opacity: 0.36, group: 1 },
  { top: '54.8%', left: '53.9%', size: 0.8, opacity: 0.58, group: 2 },
  { top: '52.9%', left: '18.4%', size: 1.7, opacity: 0.91, group: 3 },
  { top: '89.3%', left: '13.7%', size: 1.5, opacity: 0.78, group: 4 },
  { top: '96.6%', left: '77.9%', size: 1.4, opacity: 0.87, group: 5 },
  { top: '22.1%', left: '53.1%', size: 1.7, opacity: 0.87, group: 0 },
  { top: '76.2%', left: '50.3%', size: 1.1, opacity: 0.48, group: 1 },
  { top: '52.5%', left: '14.4%', size: 1.1, opacity: 0.37, group: 2 },
  { top: '71.4%', left: '19.8%', size: 1.0, opacity: 0.53, group: 3 },
  { top: '64.6%', left: '53.3%', size: 1.2, opacity: 0.61, group: 4 },
  { top: '54.5%', left: '71.0%', size: 1.9, opacity: 0.95, group: 5 },
  { top: '57.7%', left: '38.1%', size: 1.1, opacity: 0.69, group: 0 },
  { top: '37.5%', left: '28.1%', size: 1.5, opacity: 0.67, group: 1 },
  { top: '58.1%', left: '68.9%', size: 2.1, opacity: 0.98, group: 2 },
  { top: '71.8%', left: '16.4%', size: 1.1, opacity: 0.61, group: 3 },
  { top: '36.0%', left: '66.3%', size: 1.2, opacity: 0.7, group: 4 },
  { top: '68.5%', left: '2.8%', size: 0.8, opacity: 0.5, group: 5 },
  { top: '20.6%', left: '15.0%', size: 1.4, opacity: 0.8, group: 0 },
  { top: '58.6%', left: '61.0%', size: 1.5, opacity: 0.61, group: 1 },
  { top: '22.2%', left: '16.4%', size: 1.0, opacity: 0.7, group: 2 },
  { top: '60.5%', left: '73.3%', size: 1.4, opacity: 0.8, group: 3 },
  { top: '69.3%', left: '26.3%', size: 0.8, opacity: 0.38, group: 4 },
  { top: '34.8%', left: '58.1%', size: 1.2, opacity: 0.85, group: 5 },
  { top: '17.2%', left: '16.5%', size: 1.0, opacity: 0.36, group: 0 },
  { top: '33.5%', left: '89.6%', size: 2.1, opacity: 0.94, group: 1 },
  { top: '37.9%', left: '69.3%', size: 1.1, opacity: 0.36, group: 2 },
  { top: '74.0%', left: '62.0%', size: 0.8, opacity: 0.58, group: 3 },
  { top: '18.2%', left: '19.4%', size: 0.8, opacity: 0.49, group: 4 },
  { top: '56.8%', left: '98.0%', size: 0.8, opacity: 0.67, group: 5 },
  { top: '84.7%', left: '8.7%', size: 1.4, opacity: 0.82, group: 0 },
  { top: '53.4%', left: '35.9%', size: 1.9, opacity: 0.88, group: 1 },
  { top: '80.6%', left: '43.0%', size: 1.0, opacity: 0.38, group: 2 },
  { top: '74.7%', left: '14.5%', size: 1.5, opacity: 0.77, group: 3 },
  { top: '24.8%', left: '44.3%', size: 1.1, opacity: 0.38, group: 4 },
  { top: '91.7%', left: '86.4%', size: 1.9, opacity: 0.94, group: 5 },
  { top: '7.8%', left: '94.2%', size: 1.4, opacity: 0.72, group: 0 },
  { top: '39.4%', left: '35.3%', size: 1.1, opacity: 0.58, group: 1 },
  { top: '58.4%', left: '70.0%', size: 1.2, opacity: 0.66, group: 2 },
  { top: '25.2%', left: '33.8%', size: 0.8, opacity: 0.53, group: 3 },
  { top: '54.4%', left: '97.8%', size: 1.1, opacity: 0.52, group: 4 },
  { top: '63.0%', left: '24.7%', size: 0.8, opacity: 0.46, group: 5 },
  { top: '80.8%', left: '39.6%', size: 1.9, opacity: 0.91, group: 0 },
  { top: '64.6%', left: '45.4%', size: 1.4, opacity: 0.74, group: 1 },
  { top: '93.5%', left: '85.7%', size: 0.8, opacity: 0.69, group: 2 },
  { top: '49.0%', left: '77.7%', size: 1.7, opacity: 0.91, group: 3 },
  { top: '12.6%', left: '40.1%', size: 1.0, opacity: 0.37, group: 4 },
  { top: '83.7%', left: '26.6%', size: 1.1, opacity: 0.67, group: 5 },
  { top: '70.0%', left: '63.0%', size: 2.1, opacity: 0.95, group: 0 },
  { top: '40.2%', left: '66.2%', size: 0.8, opacity: 0.44, group: 1 },
  { top: '67.5%', left: '22.1%', size: 1.1, opacity: 0.54, group: 2 },
  { top: '97.5%', left: '36.3%', size: 1.1, opacity: 0.37, group: 3 },
  { top: '73.6%', left: '75.7%', size: 1.4, opacity: 0.81, group: 4 },
  { top: '44.2%', left: '74.0%', size: 1.4, opacity: 0.63, group: 5 },
  { top: '5.9%', left: '13.0%', size: 1.1, opacity: 0.57, group: 0 },
  { top: '91.3%', left: '50.2%', size: 1.0, opacity: 0.66, group: 1 },
  { top: '91.8%', left: '15.8%', size: 1.0, opacity: 0.4, group: 2 },
  { top: '19.1%', left: '70.7%', size: 1.1, opacity: 0.54, group: 3 },
  { top: '43.7%', left: '67.9%', size: 1.2, opacity: 0.77, group: 4 },
  { top: '51.0%', left: '88.0%', size: 1.0, opacity: 0.38, group: 5 },
  { top: '22.9%', left: '92.5%', size: 0.8, opacity: 0.53, group: 0 },
  { top: '92.7%', left: '20.7%', size: 1.1, opacity: 0.5, group: 1 },
  { top: '30.1%', left: '63.5%', size: 1.1, opacity: 0.65, group: 2 },
  { top: '93.7%', left: '55.4%', size: 1.4, opacity: 0.66, group: 3 },
  { top: '71.5%', left: '8.3%', size: 1.4, opacity: 0.8, group: 4 },
  { top: '45.6%', left: '5.4%', size: 1.0, opacity: 0.39, group: 5 },
  { top: '37.7%', left: '38.4%', size: 1.1, opacity: 0.64, group: 0 },
  { top: '8.7%', left: '96.2%', size: 0.8, opacity: 0.5, group: 1 },
  { top: '88.7%', left: '25.2%', size: 1.1, opacity: 0.49, group: 2 },
  { top: '59.9%', left: '18.9%', size: 1.1, opacity: 0.4, group: 3 },
  { top: '18.3%', left: '24.7%', size: 1.1, opacity: 0.57, group: 4 },
  { top: '79.6%', left: '10.4%', size: 1.2, opacity: 0.87, group: 5 },
  { top: '76.7%', left: '85.5%', size: 1.0, opacity: 0.55, group: 0 },
  { top: '52.3%', left: '3.1%', size: 1.4, opacity: 0.64, group: 1 },
  { top: '42.8%', left: '91.8%', size: 1.0, opacity: 0.42, group: 2 },
  { top: '2.8%', left: '27.1%', size: 1.1, opacity: 0.61, group: 3 },
  { top: '31.9%', left: '50.4%', size: 2.1, opacity: 0.86, group: 4 },
  { top: '76.3%', left: '73.6%', size: 1.0, opacity: 0.66, group: 5 },
  { top: '33.1%', left: '89.8%', size: 1.9, opacity: 0.86, group: 0 },
  { top: '15.0%', left: '78.0%', size: 0.8, opacity: 0.66, group: 1 },
  { top: '13.4%', left: '7.2%', size: 1.4, opacity: 0.79, group: 2 },
  { top: '76.8%', left: '32.7%', size: 1.9, opacity: 0.87, group: 3 },
  { top: '94.8%', left: '9.1%', size: 1.9, opacity: 0.86, group: 4 },
  { top: '76.8%', left: '82.1%', size: 1.5, opacity: 0.67, group: 5 },
  { top: '81.2%', left: '51.4%', size: 1.0, opacity: 0.67, group: 0 },
  { top: '20.6%', left: '8.8%', size: 1.5, opacity: 0.87, group: 1 },
  { top: '68.4%', left: '36.0%', size: 1.9, opacity: 0.94, group: 2 },
  { top: '58.9%', left: '52.5%', size: 1.2, opacity: 0.74, group: 3 },
  { top: '20.5%', left: '57.5%', size: 1.0, opacity: 0.38, group: 4 },
  { top: '14.7%', left: '89.5%', size: 1.0, opacity: 0.58, group: 5 },
  { top: '68.3%', left: '59.8%', size: 1.2, opacity: 0.64, group: 0 },
  { top: '17.8%', left: '85.4%', size: 1.0, opacity: 0.44, group: 1 },
  { top: '78.8%', left: '50.0%', size: 1.5, opacity: 0.76, group: 2 },
  { top: '74.5%', left: '7.6%', size: 1.0, opacity: 0.64, group: 3 },
  { top: '94.7%', left: '85.5%', size: 1.1, opacity: 0.57, group: 4 },
  { top: '58.0%', left: '27.6%', size: 0.8, opacity: 0.53, group: 5 },
  { top: '64.7%', left: '63.5%', size: 1.0, opacity: 0.38, group: 0 },
  { top: '72.0%', left: '61.7%', size: 1.4, opacity: 0.82, group: 1 },
  { top: '54.5%', left: '69.1%', size: 2.1, opacity: 0.87, group: 2 },
  { top: '79.7%', left: '86.6%', size: 1.0, opacity: 0.38, group: 3 },
  { top: '11.2%', left: '8.4%', size: 1.0, opacity: 0.6, group: 4 },
  { top: '53.2%', left: '22.0%', size: 1.0, opacity: 0.62, group: 5 },
  { top: '86.6%', left: '62.5%', size: 1.5, opacity: 0.8, group: 0 },
  { top: '60.5%', left: '36.8%', size: 1.1, opacity: 0.67, group: 1 },
  { top: '28.8%', left: '29.8%', size: 0.8, opacity: 0.42, group: 2 },
  { top: '33.2%', left: '19.6%', size: 0.8, opacity: 0.66, group: 3 },
  { top: '42.1%', left: '64.7%', size: 1.5, opacity: 0.6, group: 4 },
  { top: '57.8%', left: '70.1%', size: 1.0, opacity: 0.43, group: 5 },
  { top: '89.1%', left: '77.6%', size: 1.5, opacity: 0.69, group: 0 },
  { top: '6.5%', left: '88.8%', size: 1.9, opacity: 0.94, group: 1 },
  { top: '56.8%', left: '30.9%', size: 1.2, opacity: 0.82, group: 2 },
  { top: '25.7%', left: '6.1%', size: 1.0, opacity: 0.69, group: 3 },
  { top: '7.9%', left: '21.2%', size: 1.4, opacity: 0.78, group: 4 },
  { top: '96.9%', left: '43.8%', size: 1.1, opacity: 0.56, group: 5 },
  { top: '37.2%', left: '38.0%', size: 1.1, opacity: 0.42, group: 0 },
  { top: '28.9%', left: '26.4%', size: 1.7, opacity: 0.97, group: 1 },
  { top: '24.1%', left: '35.8%', size: 1.4, opacity: 0.7, group: 2 },
  { top: '80.6%', left: '67.6%', size: 1.5, opacity: 0.83, group: 3 },
  { top: '6.0%', left: '72.2%', size: 1.0, opacity: 0.48, group: 4 },
  { top: '86.9%', left: '46.4%', size: 1.2, opacity: 0.74, group: 5 },
  { top: '11.8%', left: '42.3%', size: 0.8, opacity: 0.52, group: 0 },
  { top: '5.2%', left: '60.5%', size: 1.1, opacity: 0.48, group: 1 },
  { top: '4.9%', left: '62.2%', size: 0.8, opacity: 0.67, group: 2 },
  { top: '19.9%', left: '64.1%', size: 0.8, opacity: 0.69, group: 3 },
  { top: '52.8%', left: '45.5%', size: 0.8, opacity: 0.52, group: 4 },
  { top: '56.6%', left: '59.3%', size: 1.4, opacity: 0.78, group: 5 },
  { top: '70.3%', left: '27.3%', size: 0.8, opacity: 0.53, group: 0 },
  { top: '89.7%', left: '36.7%', size: 1.0, opacity: 0.6, group: 1 },
  { top: '73.1%', left: '56.8%', size: 1.5, opacity: 0.64, group: 2 },
  { top: '77.6%', left: '91.3%', size: 1.1, opacity: 0.47, group: 3 },
  { top: '41.6%', left: '42.9%', size: 1.7, opacity: 0.96, group: 4 },
  { top: '19.7%', left: '28.6%', size: 0.8, opacity: 0.53, group: 5 },
  { top: '93.3%', left: '39.9%', size: 1.5, opacity: 0.84, group: 0 },
  { top: '90.2%', left: '55.0%', size: 1.1, opacity: 0.48, group: 1 },
  { top: '27.6%', left: '53.9%', size: 1.4, opacity: 0.74, group: 2 },
  { top: '31.8%', left: '22.7%', size: 1.1, opacity: 0.39, group: 3 },
  { top: '88.5%', left: '74.8%', size: 0.8, opacity: 0.56, group: 4 },
  { top: '43.7%', left: '34.4%', size: 0.8, opacity: 0.57, group: 5 },
  { top: '63.7%', left: '13.8%', size: 0.8, opacity: 0.37, group: 0 },
  { top: '23.0%', left: '88.0%', size: 1.5, opacity: 0.84, group: 1 },
  { top: '21.7%', left: '90.7%', size: 1.9, opacity: 0.91, group: 2 },
  { top: '13.4%', left: '70.5%', size: 1.0, opacity: 0.37, group: 3 },
  { top: '62.4%', left: '16.9%', size: 0.8, opacity: 0.4, group: 4 },
  { top: '1.7%', left: '63.8%', size: 1.2, opacity: 0.69, group: 5 },
  { top: '46.6%', left: '41.5%', size: 0.8, opacity: 0.56, group: 0 },
  { top: '94.7%', left: '21.3%', size: 1.0, opacity: 0.45, group: 1 },
  { top: '37.3%', left: '68.3%', size: 1.0, opacity: 0.48, group: 2 },
  { top: '46.4%', left: '65.1%', size: 1.1, opacity: 0.43, group: 3 },
  { top: '70.2%', left: '31.9%', size: 0.8, opacity: 0.66, group: 4 },
  { top: '31.0%', left: '11.7%', size: 1.0, opacity: 0.39, group: 5 },
  { top: '24.2%', left: '73.9%', size: 1.0, opacity: 0.62, group: 0 },
  { top: '82.7%', left: '19.5%', size: 1.1, opacity: 0.64, group: 1 },
  { top: '93.2%', left: '88.3%', size: 1.1, opacity: 0.61, group: 2 },
  { top: '87.0%', left: '86.8%', size: 1.2, opacity: 0.67, group: 3 },
  { top: '38.2%', left: '93.8%', size: 0.8, opacity: 0.35, group: 4 },
  { top: '23.7%', left: '89.9%', size: 1.1, opacity: 0.46, group: 5 },
  { top: '63.5%', left: '22.2%', size: 1.7, opacity: 0.94, group: 0 },
  { top: '84.8%', left: '7.3%', size: 0.8, opacity: 0.53, group: 1 },
  { top: '39.9%', left: '26.3%', size: 1.2, opacity: 0.8, group: 2 },
  { top: '64.7%', left: '93.8%', size: 0.8, opacity: 0.36, group: 3 },
  { top: '32.0%', left: '77.9%', size: 1.0, opacity: 0.35, group: 4 },
  { top: '2.9%', left: '35.4%', size: 1.1, opacity: 0.51, group: 5 },
  { top: '30.5%', left: '32.8%', size: 1.4, opacity: 0.86, group: 0 },
  { top: '12.3%', left: '72.1%', size: 1.7, opacity: 0.97, group: 1 },
  { top: '40.7%', left: '24.3%', size: 1.1, opacity: 0.68, group: 2 },
  { top: '11.3%', left: '16.0%', size: 1.1, opacity: 0.6, group: 3 },
  { top: '90.0%', left: '32.8%', size: 1.4, opacity: 0.78, group: 4 },
  { top: '69.8%', left: '80.6%', size: 1.2, opacity: 0.77, group: 5 },
  { top: '25.7%', left: '23.0%', size: 1.5, opacity: 0.64, group: 0 },
  { top: '12.6%', left: '77.1%', size: 1.1, opacity: 0.35, group: 1 },
  { top: '20.1%', left: '97.1%', size: 1.0, opacity: 0.36, group: 2 },
  { top: '23.0%', left: '97.5%', size: 0.8, opacity: 0.41, group: 3 },
  { top: '83.3%', left: '51.5%', size: 1.0, opacity: 0.68, group: 4 },
  { top: '52.3%', left: '86.6%', size: 1.1, opacity: 0.4, group: 5 },
  { top: '67.0%', left: '24.0%', size: 1.1, opacity: 0.54, group: 0 },
  { top: '7.9%', left: '60.3%', size: 1.0, opacity: 0.39, group: 1 },
  { top: '13.9%', left: '14.7%', size: 1.2, opacity: 0.73, group: 2 },
  { top: '77.5%', left: '65.8%', size: 1.1, opacity: 0.36, group: 3 },
  { top: '25.5%', left: '46.4%', size: 1.2, opacity: 0.63, group: 4 },
  { top: '10.0%', left: '30.7%', size: 1.1, opacity: 0.69, group: 5 },
  { top: '53.1%', left: '55.8%', size: 0.8, opacity: 0.5, group: 0 },
  { top: '88.3%', left: '30.2%', size: 1.1, opacity: 0.44, group: 1 },
  { top: '9.9%', left: '33.1%', size: 1.4, opacity: 0.62, group: 2 },
  { top: '47.7%', left: '76.8%', size: 0.8, opacity: 0.39, group: 3 },
  { top: '15.1%', left: '64.6%', size: 1.1, opacity: 0.36, group: 4 },
  { top: '86.7%', left: '37.5%', size: 0.8, opacity: 0.42, group: 5 },
  { top: '13.9%', left: '5.7%', size: 2.1, opacity: 1.0, group: 0 },
  { top: '39.2%', left: '51.8%', size: 1.2, opacity: 0.74, group: 1 },
  { top: '79.5%', left: '18.8%', size: 0.8, opacity: 0.52, group: 2 },
  { top: '14.7%', left: '93.1%', size: 1.2, opacity: 0.77, group: 3 },
  { top: '31.8%', left: '72.1%', size: 0.8, opacity: 0.69, group: 4 },
  { top: '86.9%', left: '73.5%', size: 1.5, opacity: 0.68, group: 5 },
  { top: '44.1%', left: '59.8%', size: 1.0, opacity: 0.5, group: 0 },
  { top: '38.9%', left: '4.6%', size: 0.8, opacity: 0.54, group: 1 },
  { top: '91.0%', left: '56.5%', size: 1.1, opacity: 0.44, group: 2 },
  { top: '33.0%', left: '80.1%', size: 1.5, opacity: 0.83, group: 3 },
  { top: '2.2%', left: '85.1%', size: 1.0, opacity: 0.38, group: 4 },
  { top: '90.9%', left: '2.7%', size: 1.2, opacity: 0.74, group: 5 },
  { top: '14.5%', left: '75.9%', size: 1.4, opacity: 0.72, group: 0 },
  { top: '6.0%', left: '53.5%', size: 1.1, opacity: 0.47, group: 1 },
  { top: '57.1%', left: '11.7%', size: 1.5, opacity: 0.83, group: 2 },
  { top: '35.2%', left: '48.8%', size: 1.5, opacity: 0.86, group: 3 },
  { top: '83.8%', left: '11.3%', size: 0.8, opacity: 0.6, group: 4 },
  { top: '48.4%', left: '84.7%', size: 1.0, opacity: 0.41, group: 5 },
  { top: '88.6%', left: '47.3%', size: 0.8, opacity: 0.7, group: 0 },
  { top: '35.4%', left: '78.7%', size: 1.0, opacity: 0.65, group: 1 },

];

export const FloatingStarField: React.FC = () => {
  // 6 independent floating animation loops for rich organic drift
  const anim0X = useRef(new Animated.Value(0)).current;
  const anim0Y = useRef(new Animated.Value(0)).current;
  const anim0Pulse = useRef(new Animated.Value(0)).current;

  const anim1X = useRef(new Animated.Value(0)).current;
  const anim1Y = useRef(new Animated.Value(0)).current;
  const anim1Pulse = useRef(new Animated.Value(0)).current;

  const anim2X = useRef(new Animated.Value(0)).current;
  const anim2Y = useRef(new Animated.Value(0)).current;
  const anim2Pulse = useRef(new Animated.Value(0)).current;

  const anim3X = useRef(new Animated.Value(0)).current;
  const anim3Y = useRef(new Animated.Value(0)).current;
  const anim3Pulse = useRef(new Animated.Value(0)).current;

  const anim4X = useRef(new Animated.Value(0)).current;
  const anim4Y = useRef(new Animated.Value(0)).current;
  const anim4Pulse = useRef(new Animated.Value(0)).current;

  const anim5X = useRef(new Animated.Value(0)).current;
  const anim5Y = useRef(new Animated.Value(0)).current;
  const anim5Pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createLoop = (
      valX: Animated.Value,
      valY: Animated.Value,
      valPulse: Animated.Value,
      rangeX: number,
      rangeY: number,
      duration: number,
    ) => {
      const loopX = Animated.loop(
        Animated.sequence([
          Animated.timing(valX, {
            toValue: rangeX,
            duration: duration * 0.45,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(valX, {
            toValue: -rangeX,
            duration: duration * 0.55,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(valX, {
            toValue: 0,
            duration: duration * 0.4,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );

      const loopY = Animated.loop(
        Animated.sequence([
          Animated.timing(valY, {
            toValue: -rangeY,
            duration: duration * 0.5,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(valY, {
            toValue: rangeY,
            duration: duration * 0.5,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(valY, {
            toValue: 0,
            duration: duration * 0.4,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );

      const loopPulse = Animated.loop(
        Animated.sequence([
          Animated.timing(valPulse, {
            toValue: 1,
            duration: duration * 0.38,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(valPulse, {
            toValue: 0,
            duration: duration * 0.62,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );

      loopX.start();
      loopY.start();
      loopPulse.start();

      return () => {
        loopX.stop();
        loopY.stop();
        loopPulse.stop();
      };
    };

    const stop0 = createLoop(anim0X, anim0Y, anim0Pulse, 5, 7, 3600);
    const stop1 = createLoop(anim1X, anim1Y, anim1Pulse, -7, 5, 4400);
    const stop2 = createLoop(anim2X, anim2Y, anim2Pulse, 8, -8, 5200);
    const stop3 = createLoop(anim3X, anim3Y, anim3Pulse, -5, -7, 4000);
    const stop4 = createLoop(anim4X, anim4Y, anim4Pulse, 7, 6, 5800);
    const stop5 = createLoop(anim5X, anim5Y, anim5Pulse, -6, 8, 4900);

    return () => {
      stop0();
      stop1();
      stop2();
      stop3();
      stop4();
      stop5();
    };
  }, [
    anim0Pulse, anim0X, anim0Y,
    anim1Pulse, anim1X, anim1Y,
    anim2Pulse, anim2X, anim2Y,
    anim3Pulse, anim3X, anim3Y,
    anim4Pulse, anim4X, anim4Y,
    anim5Pulse, anim5X, anim5Y,
  ]);

  const groupTransforms = [
    {
      translateX: anim0X,
      translateY: anim0Y,
      opacityMultiplier: anim0Pulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.15] }),
    },
    {
      translateX: anim1X,
      translateY: anim1Y,
      opacityMultiplier: anim1Pulse.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1.2] }),
    },
    {
      translateX: anim2X,
      translateY: anim2Y,
      opacityMultiplier: anim2Pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.25] }),
    },
    {
      translateX: anim3X,
      translateY: anim3Y,
      opacityMultiplier: anim3Pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.15] }),
    },
    {
      translateX: anim4X,
      translateY: anim4Y,
      opacityMultiplier: anim4Pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.1] }),
    },
    {
      translateX: anim5X,
      translateY: anim5Y,
      opacityMultiplier: anim5Pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.2] }),
    },
  ];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {STARS.map((star, index) => {
        const group = groupTransforms[star.group];
        const starOpacity = Animated.multiply(group.opacityMultiplier, star.opacity);

        return (
          <Animated.View
            key={index}
            style={[
              styles.star,
              {
                top: star.top as any,
                left: star.left as any,
                width: star.size,
                height: star.size,
                borderRadius: star.size / 2,
                opacity: starOpacity,
                transform: [{ translateX: group.translateX }, { translateY: group.translateY }],
              },
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  star: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
  },
});

export default FloatingStarField;
