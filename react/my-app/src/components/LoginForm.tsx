// This component renders a form for creating or editing a paper.

import type { SubmitEvent } from "react";
import type { LoginFormData } from "../types";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { inputClass, submitClass } from "../lib/ui";

const empty_form: LoginFormData = {
	username: "",
	email: "",
	password: "",
	confirmPass: ""
}

type LoginFormProps = {
	createNew: boolean;
	onSubmit: (payload: LoginFormData) => Promise<void>;
}

export default function LoginForm({createNew, onSubmit }: LoginFormProps) {

	const [submitting, setSubmitting] = useState(false);// Prevent multiple form submissions
	const [form, setForm] = useState(empty_form);

	// Clear form when we switch between logging in and creating account
	useEffect(() => {
		function emptyForm() {
			setForm(empty_form);
		}
		emptyForm();
	}, [createNew]);

	// Disable form while calling onSubmit
	async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();

		if (submitting) return;
		setSubmitting(true);
		try {
				await onSubmit(form);
		} finally {
				setSubmitting(false);
		}
	}

	return (
		<form
      noValidate
      onSubmit={handleSubmit}
			className="mt-3 space-y-4"
   	>
    		{createNew && <div>
		  	<label htmlFor="Username">Username:</label>
				<input
					id="username"
					name="username"
					type="text"
					className={ inputClass }
		      value={form.username}
		      disabled={submitting}
		      onChange={(event) => {
						setForm({...form, username: event.target.value})
		      }}
		     />
			</div>}
     	<div>
        <label htmlFor="email">Email:</label>
        <input
          id="email"
          name="email"
          type="email"
					className={ inputClass }
          value={form.email}
          disabled={submitting}
          onChange={(event) => {
					setForm({ ...form, email: event.target.value })
          }}
        />
      </div>
      <div>
        <label htmlFor="password">Password:</label>
        <input
          id="password"
          name="password"
          type="password"
					className={ inputClass }
          value={form.password}
          disabled={submitting}
          onChange={(event) => {
					setForm({...form, password: event.target.value})
          }}
        />
			</div>
			{createNew && <div>
		    <label htmlFor="confirm">Confirm Password:</label>
		    <input
		    	id="confirm"
		      name="confirm"
		      type="password"
					className={ inputClass }
		      value={form.confirmPass}
		      disabled={submitting}
		      onChange={(event) => {
						setForm({...form, confirmPass: event.target.value})
		      }}
		    />
			</div>}
      <Button type="submit" disabled={submitting} className={submitClass}>
        {createNew ? "Create New Account" : "Sign In"}
      </Button>
    </form>
	);
}
