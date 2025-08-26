-- Performance indexes for common queries
CREATE INDEX IF NOT EXISTS idx_session_startAt ON "Session"("startAt");
CREATE INDEX IF NOT EXISTS idx_session_status ON "Session"("status");
CREATE INDEX IF NOT EXISTS idx_session_start_status ON "Session"("startAt", "status");

CREATE INDEX IF NOT EXISTS idx_session_team_sessionId ON "SessionTeam"("sessionId");
CREATE INDEX IF NOT EXISTS idx_session_team_teamId ON "SessionTeam"("teamId");

CREATE INDEX IF NOT EXISTS idx_match_sessionId ON "Match"("sessionId");
CREATE INDEX IF NOT EXISTS idx_match_home_away ON "Match"("homeTeamId", "awayTeamId");

CREATE INDEX IF NOT EXISTS idx_matchstat_match ON "MatchStat"("matchId");
CREATE INDEX IF NOT EXISTS idx_matchstat_user ON "MatchStat"("userId");

CREATE INDEX IF NOT EXISTS idx_team_member_team ON "TeamMember"("teamId");
CREATE INDEX IF NOT EXISTS idx_team_member_user ON "TeamMember"("userId");

CREATE INDEX IF NOT EXISTS idx_session_reg_session ON "SessionRegistration"("sessionId");
CREATE INDEX IF NOT EXISTS idx_session_reg_user ON "SessionRegistration"("userId");
CREATE INDEX IF NOT EXISTS idx_session_reg_status ON "SessionRegistration"("status");


