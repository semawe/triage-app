-- CreateIndex
CREATE INDEX "JoinRequest_organisationId_status_idx" ON "JoinRequest"("organisationId", "status");

-- CreateIndex
CREATE INDEX "Output_assigneeId_type_isDone_idx" ON "Output"("assigneeId", "type", "isDone");

-- CreateIndex
CREATE INDEX "PendingInvite_orgId_expiresAt_idx" ON "PendingInvite"("orgId", "expiresAt");

-- CreateIndex
CREATE INDEX "Role_spaceId_idx" ON "Role"("spaceId");

-- CreateIndex
CREATE INDEX "RoleAssignment_userId_endDate_idx" ON "RoleAssignment"("userId", "endDate");

-- CreateIndex
CREATE INDEX "SpaceMember_userId_idx" ON "SpaceMember"("userId");
