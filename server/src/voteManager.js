// Vote Manager - handles two-phase voting
// Phase 1: Vote Request (majority yes/no to start voting)
// Phase 2: Actual Vote (pick who you think is the spy)

export function createVoteRequest(requesterId) {
  return {
    phase: 'REQUEST',
    requesterId,
    responses: new Map(), // playerId -> true/false
  };
}

export function respondToRequest(voteState, playerId, accept) {
  if (voteState.phase !== 'REQUEST') return { error: 'Oylama talebi aktif değil.' };
  if (playerId === voteState.requesterId) return { error: 'Kendi talebinize oy veremezsiniz.' };
  voteState.responses.set(playerId, accept);
  return { success: true };
}

export function checkRequestResult(voteState, totalPlayers) {
  const responses = voteState.responses;
  // Requester automatically votes yes, so we need (totalPlayers - 1) other votes
  const needed = totalPlayers - 1; // exclude the requester

  if (responses.size < needed) return { complete: false };

  let yes = 1, no = 0;
  for (const accept of responses.values()) {
    if (accept) yes++;
    else no++;
  }

  // Majority: yes > no
  const accepted = yes > no;
  return { complete: true, accepted, yes, no };
}

export function startVoting() {
  return {
    phase: 'VOTING',
    votes: new Map(), // playerId -> suspectId
  };
}

export function castVote(voteState, playerId, suspectId) {
  if (voteState.phase !== 'VOTING') return { error: 'Oylama aktif değil.' };
  voteState.votes.set(playerId, suspectId);
  return { success: true };
}

export function checkVoteResult(voteState, totalPlayers) {
  if (voteState.votes.size < totalPlayers) return { complete: false };

  // Count votes per suspect
  const counts = {};
  for (const suspectId of voteState.votes.values()) {
    counts[suspectId] = (counts[suspectId] || 0) + 1;
  }

  // Find player with most votes
  let maxVotes = 0;
  let accusedId = null;
  for (const [id, count] of Object.entries(counts)) {
    if (count > maxVotes) {
      maxVotes = count;
      accusedId = id;
    }
  }

  // Build votes detail for results display
  const votesDetail = {};
  for (const [voterId, suspectId] of voteState.votes) {
    votesDetail[voterId] = suspectId;
  }

  return { complete: true, accusedId, maxVotes, votesDetail, counts };
}
