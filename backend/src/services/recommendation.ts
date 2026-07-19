export interface UserPreferences {
  currentLocation: string;
  interests: string[];
  budgetLimit: number;
  languages: string[];
  travelStyle: string; // 'ADVENTURE' | 'LUXURY' | 'RELIGIOUS' | 'BACKPACKING' | 'FAMILY' | 'SOLO'
}

export interface TourGroup {
  id: string;
  name: string;
  cities: string[];
  budget: number;
  languages: string[];
  travelStyle: string;
}

export class RecommendationService {
  /**
   * AI Recommendation Engine
   * Calculates a match score between user preferences and tour groups.
   */
  static getRecommendations(userPrefs: UserPreferences, groups: TourGroup[]) {
    return groups
      .map((group) => {
        let score = 0;

        // 1. Location match (e.g. check if the group traverses the user's current city/stop)
        const cityMatch = group.cities.some(
          (city) => city.toLowerCase() === userPrefs.currentLocation.toLowerCase()
        );
        if (cityMatch) {
          score += 40; // High weighting for location proximity
        }

        // 2. Budget match
        if (group.budget <= userPrefs.budgetLimit) {
          score += 25;
        } else if (group.budget <= userPrefs.budgetLimit * 1.25) {
          score += 10; // slightly over budget
        }

        // 3. Travel Style match
        if (group.travelStyle.toLowerCase() === userPrefs.travelStyle.toLowerCase()) {
          score += 20;
        }

        // 4. Language match
        const languageOverlaps = group.languages.filter((lang) =>
          userPrefs.languages.some((prefLang) => prefLang.toLowerCase() === lang.toLowerCase())
        );
        if (languageOverlaps.length > 0) {
          score += 15;
        }

        return {
          group,
          matchScore: score, // Percentage representing match accuracy
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore);
  }
}
