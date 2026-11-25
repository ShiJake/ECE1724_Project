// This component serves as the login page. Users can sign into their dashboard, or create a new account

import { useState } from "react";
import LoginForm from "../components/LoginForm";
import type { LoginFormData } from "../types";
import { authClient } from "../lib/auth-client";
import { useNavigate } from "react-router";
import { Separator } from "../components/ui/separator";
import { Button } from "../components/ui/button";
import { formHeaderClass, clickableText, pageContainerClass, errStatusMsgClass } from "../lib/ui";
import Banner from "../components/Banner";



export default function Login() {
	const navigate = useNavigate();
	const [createNew, setCreateNew] = useState(false);	// Is the user logging in, or creating a new account?
	const [message, setMessage] = useState<string | null>(null);

	async function handleLogin(form: LoginFormData) {
        if (createNew && form.username.trim().length === 0) {
                setMessage("Error: Please input a username");
                return;
        }

        if (form.email.trim().length === 0) {
                setMessage("Error: Please input an email");
                return;
        }

        if (form.password.trim().length === 0) {
                setMessage("Error: Please input a password");
                return;
        }

        if (createNew && form.password !== form.confirmPass) {
                setMessage("Error: Password and Confirm Password do not match");
                return;
        }

        setMessage(createNew ? "Creating Account..." : "Logging in...");

        try {
                if (!createNew) {
                        const result = await authClient.signIn.email({
                                email: form.email,
                                password: form.password,
                        });

                        if (result.error) {
                                setMessage(`Error: ${result.error.message}`);
                                return;
                        }

                        if (!result.data?.user) {
                                setMessage("Error: Login failed. Please try again.");
                                return;
                        }

                        navigate(`/users/${result.data.user.id}`);
                } else {
                        const result = await authClient.signUp.email({
                                name: form.username.trim(),
                                email: form.email,
                                password: form.password,
                        });

                        if (result.error) {
                                setMessage(`Error: ${result.error.message}`);
                                return;
                        }

                        if (!result.data?.user) {
                                setMessage("Error: Account creation failed. Please try again.");
                                return;
                        }

                        navigate(`/users/${result.data.user.id}`);
                }
        } catch {
                setMessage("Error: Unable to connect to the server. Please try again.");
        }
	}
	return (
		<div className={pageContainerClass}>
			<Banner/>
			<div className='lg:w-1/3 w-1/2 lg:mt-20 sm:mt-15 mt-0 px-5 pt-2 pb-3 border-3 rounded-lg bg-blue-200  border-cyan-900 '>
				<p className={formHeaderClass}>{createNew ? "Sign up for Stock Watch" : "Login to your account"}</p>
				<Separator className="bg-gray-400" />
				<LoginForm createNew={createNew} onSubmit={handleLogin} />
				{/*Toggle sign in or create account modes */}
				<button type='button' className={clickableText} onClick={() => {
					setCreateNew(!createNew);
					setMessage(null);
				}}>{createNew ? "Return to Sign In" : "Create a New Account"}</button>
			</div>
			{/*Error and Status messages*/}
			{message && <Button
					type='button'
					disabled={!message.includes("Error")}
					className={`mt-3 p-2 border-2 rounded-full ${message.includes("Error")?errStatusMsgClass:"text-cyan-900"} bg-gray-200  border-cyan-800`}
					onClick={() => setMessage(null)}>
			{message}</Button>}
		</div>
	);
}
