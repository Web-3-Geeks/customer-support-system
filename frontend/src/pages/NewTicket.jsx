import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import Input from "../components/Input";
import Select from "../components/Select";
import Textarea from "../components/Textarea";
import Button from "../components/Button";
import Alert from "../components/Alert";
import { ticketApi } from "../api/ticketApi";
import { getErrorMessage } from "../utils/getErrorMessage";
import { CATEGORY_LABELS, TICKET_CATEGORIES } from "../utils/tickets";
import { usePageTitle } from "../hooks/usePageTitle";

function validate({ subject, description }) {
  const errors = {};
  if (subject.trim().length < 3) errors.subject = "Subject must be at least 3 characters";
  else if (subject.trim().length > 150) errors.subject = "Subject must be at most 150 characters";
  if (description.trim().length < 10) errors.description = "Please describe the problem in at least 10 characters";
  else if (description.trim().length > 5000) errors.description = "Description must be at most 5000 characters";
  return errors;
}

function NewTicket() {
  usePageTitle("New ticket");
  const navigate = useNavigate();
  const [form, setForm] = useState({ subject: "", category: "GENERAL", description: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    const validationErrors = validate(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSubmitting(true);
    try {
      const { data } = await ticketApi.create({
        subject: form.subject.trim(),
        category: form.category,
        description: form.description.trim(),
      });
      navigate(`/customer/tickets/${data.data.ticket._id}`, { replace: true });
    } catch (error) {
      setFormError(getErrorMessage(error));
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader title="New ticket" subtitle="Tell us what is going wrong and an agent will pick it up." />

      <form
        onSubmit={handleSubmit}
        noValidate
        className="max-w-2xl space-y-5 rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5 sm:p-8"
      >
        <Alert>{formError}</Alert>
        <Input
          label="Subject"
          name="subject"
          placeholder="Short summary of the problem"
          value={form.subject}
          onChange={handleChange}
          error={errors.subject}
          maxLength={150}
        />
        <Select label="Category" name="category" value={form.category} onChange={handleChange}>
          {TICKET_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {CATEGORY_LABELS[value]}
            </option>
          ))}
        </Select>
        <Textarea
          label="Description"
          name="description"
          placeholder="What happened, what you expected, and any steps to reproduce it"
          value={form.description}
          onChange={handleChange}
          error={errors.description}
          maxLength={5000}
        />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="dark" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit ticket"}
          </Button>
          <Button to="/customer/tickets" variant="ghost">
            Cancel
          </Button>
        </div>
      </form>
    </>
  );
}

export default NewTicket;
