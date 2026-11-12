# Title ingestion contract

External input must be a record with a non-empty string `title`. Reject missing,
null, numeric and empty titles at ingress, including whitespace-only strings.
Reject malformed records before calling `renderTitle`; internal rendering
receives a validated string and returns its uppercase form. Check valid and
invalid inputs through the ingress. Run the tool-check scripts.
