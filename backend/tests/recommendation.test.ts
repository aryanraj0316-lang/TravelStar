import { RecommendationService, UserPreferences, TourGroup } from '../src/services/recommendation';

describe('AI Recommendation Engine Unit Tests', () => {
  const mockGroups: TourGroup[] = [
    {
      id: 'g-1',
      name: 'Ranchi Vrindavan Trip',
      cities: ['Ranchi', 'Delhi', 'Mathura', 'Vrindavan'],
      budget: 8500,
      languages: ['Hindi', 'English'],
      travelStyle: 'RELIGIOUS',
    },
    {
      id: 'g-2',
      name: 'Leh Ladakh Expedition',
      cities: ['Manali', 'Sarchu', 'Leh'],
      budget: 28000,
      languages: ['English'],
      travelStyle: 'ADVENTURE',
    },
  ];

  it('should recommend Ranchi Vrindavan Trip for a traveler in Delhi with high score', () => {
    const preferences: UserPreferences = {
      currentLocation: 'Delhi',
      interests: ['Temples', 'History'],
      budgetLimit: 10000,
      languages: ['Hindi'],
      travelStyle: 'RELIGIOUS',
    };

    const recommendations = RecommendationService.getRecommendations(preferences, mockGroups);

    // First recommendation should be Ranchi Vrindavan
    expect(recommendations[0].group.id).toBe('g-1');
    
    // Ranchi Vrindavan should have a high score because of location match, budget match, travelStyle match, and language overlap.
    expect(recommendations[0].matchScore).toBeGreaterThanOrEqual(80);
  });

  it('should calculate budget penalty correctly for expensive groups', () => {
    const preferences: UserPreferences = {
      currentLocation: 'Manali',
      interests: ['Bikes', 'Snow'],
      budgetLimit: 12000, // Ladakh budget is 28000 (way over limit)
      languages: ['English'],
      travelStyle: 'ADVENTURE',
    };

    const recommendations = RecommendationService.getRecommendations(preferences, mockGroups);
    const ladakhRec = recommendations.find((r) => r.group.id === 'g-2');

    // Should not receive full budget match score boost (no +25)
    expect(ladakhRec?.matchScore).toBeLessThan(80);
  });
});
