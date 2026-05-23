// Question Manager - handles turn-based question asking
// Rules:
// 1. Each round, everyone gets asked exactly once
// 2. You can't ask the person who just asked you (unless they're the only one left)
// 3. Current asker selects who to ask from available targets

export function initQuestionRound(players) {
  const playerIds = players.map(p => p.id);
  // Pick random first asker
  const firstAskerIdx = Math.floor(Math.random() * playerIds.length);
  return {
    round: 1,
    currentAskerId: playerIds[firstAskerIdx],
    previousAskerId: null,
    askedPlayerIds: [], // players who have been asked (received a question)
    playerIds: [...playerIds],
  };
}

export function getAvailableTargets(questionState) {
  const { currentAskerId, previousAskerId, askedPlayerIds, playerIds } = questionState;

  // Players who haven't been asked yet (excluding current asker)
  let available = playerIds.filter(id =>
    id !== currentAskerId && !askedPlayerIds.includes(id)
  );

  // If possible, exclude the person who asked current asker (previousAsker)
  if (available.length > 1 && previousAskerId) {
    const filtered = available.filter(id => id !== previousAskerId);
    if (filtered.length > 0) {
      available = filtered;
    }
  }

  return available;
}

export function selectTarget(questionState, targetId) {
  const available = getAvailableTargets(questionState);
  if (!available.includes(targetId)) {
    return { error: 'Bu oyuncuya soru soramazsınız.' };
  }

  questionState.askedPlayerIds.push(targetId);
  return { success: true, askerId: questionState.currentAskerId, targetId };
}

export function completeTurn(questionState) {
  const { askedPlayerIds, playerIds } = questionState;

  // The last asked player becomes the next asker
  const lastAsked = askedPlayerIds[askedPlayerIds.length - 1];
  questionState.previousAskerId = questionState.currentAskerId;
  questionState.currentAskerId = lastAsked;

  // Check if round is complete (everyone has been asked)
  // Everyone except the very first asker of the round should have been asked
  const allAsked = playerIds.every(id =>
    askedPlayerIds.includes(id) || id === questionState.currentAskerId
  );

  if (askedPlayerIds.length >= playerIds.length - 1) {
    // New round - the current asker hasn't been asked yet in this round
    // Actually, let's check: everyone has been asked once
    // In a full round: N-1 questions asked (first asker doesn't get asked in that round)
    // Wait, the requirement says everyone gets asked once per round
    // So we need N questions for N players
    // Actually re-reading: "bir tur içerisinde herkes bir kere sorulmuş olsun"
    // This means everyone should be asked once. The chain continues until everyone is asked.
    // With N players, we need exactly N asks (each person asked once).
    // The first asker also gets asked at the end of the chain.

    if (askedPlayerIds.length >= playerIds.length) {
      // Round complete - everyone has been asked
      return { roundComplete: true, newRound: startNewRound(questionState) };
    }
  }

  return { roundComplete: false };
}

function startNewRound(questionState) {
  questionState.round += 1;
  questionState.askedPlayerIds = [];
  questionState.previousAskerId = null;
  // Current asker carries over from last round
  return questionState;
}

export function removePlayer(questionState, playerId) {
  questionState.playerIds = questionState.playerIds.filter(id => id !== playerId);
  questionState.askedPlayerIds = questionState.askedPlayerIds.filter(id => id !== playerId);

  if (questionState.currentAskerId === playerId) {
    // Move to next available player
    const remaining = questionState.playerIds.filter(id => !questionState.askedPlayerIds.includes(id));
    questionState.currentAskerId = remaining[0] || questionState.playerIds[0];
  }
  if (questionState.previousAskerId === playerId) {
    questionState.previousAskerId = null;
  }
}
