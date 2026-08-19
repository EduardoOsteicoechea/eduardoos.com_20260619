package payments

import "context"

// HomescoolStudentChecker reports whether an email is registered as a
// Homescool student by at least one teacher (teacher→student link exists).
// Wired from main via the homescool link store so payments never imports
// the homescool package (avoids cycles).
//
// Product rule: linked students may use Homescool without a paid
// homescool entitlement; teachers still need a subscription (or admin).
type HomescoolStudentChecker interface {
	IsHomescoolStudent(ctx context.Context, email string) (bool, error)
}
