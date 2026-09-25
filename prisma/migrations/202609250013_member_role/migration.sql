-- Household sharing: a plan can now have members besides its owner.
ALTER TABLE "BudgetMember" DROP CONSTRAINT "member_owner_role";
ALTER TABLE "BudgetMember" ADD CONSTRAINT "member_owner_role" CHECK (role IN ('owner', 'member'));
