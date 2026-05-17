/**
 * GoalForge — Progress Score Computation Engine
 * Implements all UoM formulas from BRD Table 0
 * 
 * UoM Types and Formulas:
 * - Min (Numeric/%) : Higher is better → Achievement ÷ Target
 * - Max (Numeric/%) : Lower is better → Target ÷ Achievement  
 * - Timeline        : Date-based → Completion date vs. Deadline
 * - Zero            : Zero = Success → If 0 → 100%, else 0%
 */

/**
 * Compute progress score for a single goal achievement
 * @param {object} goal - Goal with uom_type, target_value, target_date
 * @param {object} achievement - Achievement with actual_value, completion_date
 * @returns {number} Score between 0 and 100 (can exceed 100 for over-achievement)
 */
function computeProgressScore(goal, achievement) {
  if (!achievement || achievement.status === 'not_started') {
    return 0;
  }

  const { uom_type, target_value, target_date } = goal;
  const { actual_value, completion_date } = achievement;

  switch (uom_type) {
    case 'min_numeric':
    case 'min_percent': {
      // Higher is better: Achievement ÷ Target
      if (!target_value || target_value === 0) return 0;
      const score = (actual_value / target_value) * 100;
      return Math.min(Math.round(score * 100) / 100, 150); // Cap at 150%
    }

    case 'max_numeric':
    case 'max_percent': {
      // Lower is better: Target ÷ Achievement
      if (!actual_value || actual_value === 0) {
        return target_value === 0 ? 100 : 100; // Achieved zero when target is low = perfect
      }
      const score = (target_value / actual_value) * 100;
      return Math.min(Math.round(score * 100) / 100, 150);
    }

    case 'timeline': {
      // Completion date vs Deadline
      if (!target_date) return 0;
      if (!completion_date) return 0;
      
      const deadline = new Date(target_date);
      const completed = new Date(completion_date);
      
      if (completed <= deadline) {
        return 100; // On time or early
      }
      // Late: reduce score proportionally (10% per week late, min 0)
      const daysLate = Math.ceil((completed - deadline) / (1000 * 60 * 60 * 24));
      const penalty = Math.min(daysLate * (100 / 30), 100); // Fully penalized after 30 days
      return Math.max(Math.round(100 - penalty), 0);
    }

    case 'zero': {
      // Zero = Success: If 0 → 100%, else 0%
      return actual_value === 0 ? 100 : 0;
    }

    default:
      return 0;
  }
}

/**
 * Compute weighted overall progress for a goal sheet
 * @param {Array} goalsWithAchievements - Array of { goal, achievement } pairs
 * @returns {{ overall_score: number, goal_scores: Array }}
 */
function computeOverallProgress(goalsWithAchievements) {
  let weightedSum = 0;
  let totalWeight = 0;
  const goalScores = [];

  for (const { goal, achievement } of goalsWithAchievements) {
    const score = computeProgressScore(goal, achievement);
    const weightedScore = (score * goal.weightage) / 100;
    weightedSum += weightedScore;
    totalWeight += goal.weightage;

    goalScores.push({
      goal_id: goal.id,
      title: goal.title,
      weightage: goal.weightage,
      raw_score: score,
      weighted_score: Math.round(weightedScore * 100) / 100,
    });
  }

  return {
    overall_score: totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100 * 100) / 100 : 0,
    goal_scores: goalScores,
  };
}

module.exports = { computeProgressScore, computeOverallProgress };
